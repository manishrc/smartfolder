import { generateText, tool } from 'ai';
import { StepResult } from 'ai';
import { z } from 'zod';
// @ts-expect-error - stepCountIs is exported but TypeScript can't resolve it in this build setup
import { stepCountIs } from 'ai';
import {
  ToolDefinition,
  ToolInvocationContext,
  ToolInvocationResult,
} from '../tools/fileTools';
import { ToolId } from '../config';
import { Logger } from '../logger';

export interface AiWorkflowRequest {
  systemPrompt: string;
  userPrompt:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: string }
        | { type: 'file'; data: Buffer; mediaType: string }
      >;
  tools: ToolDefinition[];
  availableToolIds: ToolId[];
  maxToolCalls: number;
  toolContextFactory: (toolId: ToolId) => ToolInvocationContext;
  invokeTool: (
    toolId: ToolId,
    args: Record<string, unknown>,
    ctx: ToolInvocationContext
  ) => Promise<ToolInvocationResult>;
}

export interface AiWorkflowResult {
  finalText: string;
  toolResults: ToolInvocationResult[];
}

export interface AiClientOptions {
  apiKey?: string;
  model: string;
  temperature: number;
  logger: Logger;
}

export class AiClient {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly logger: Logger;

  constructor(options: AiClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.temperature = options.temperature;
    this.logger = options.logger;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async runWorkflow(request: AiWorkflowRequest): Promise<AiWorkflowResult> {
    if (!this.apiKey) {
      throw new Error(
        'AI API key is missing. Set AI_GATEWAY_API_KEY, ~/.smartfolder/token, or ai.apiKey in config.'
      );
    }

    const toolResults: ToolInvocationResult[] = [];

    // Convert tool definitions to v6 beta format
    // The SDK will automatically execute tools when they're called
    const tools = this.convertToolsToV6Format(
      request.tools,
      request.availableToolIds,
      request.invokeTool,
      request.toolContextFactory,
      toolResults
    );

    // Convert userPrompt to messages format
    // If userPrompt is a string, use it as a simple prompt
    // If it's an array, convert it to messages format with content array
    const messages = Array.isArray(request.userPrompt)
      ? [
          {
            role: 'user' as const,
            content: request.userPrompt,
          },
        ]
      : undefined;
    const prompt = Array.isArray(request.userPrompt)
      ? undefined
      : request.userPrompt;

    // Use system and prompt/messages directly
    // The SDK automatically handles multi-turn agent loops when stopWhen is set
    // It will continue until the stop condition is met or the model finishes naturally
    try {
      const result = await generateText({
        model: this.model,
        ...(this.apiKey && { apiKey: this.apiKey }),
        system: request.systemPrompt,
        ...(messages ? { messages } : { prompt }),
        temperature: this.temperature,
        tools,
        // Use stopWhen with stepCountIs for v6 beta multi-turn agent loop
        // This replaces the deprecated maxSteps parameter
        stopWhen: stepCountIs(request.maxToolCalls),
        onStepFinish: (step: StepResult) => {
          // Track tool calls and text generation for logging
          if (step.stepType === 'tool-call') {
            this.logger.debug(
              { tool: step.toolCalls[0]?.toolName, step: step.stepIndex },
              'Tool call executed.'
            );
          } else if (step.stepType === 'text') {
            this.logger.debug(
              { step: step.stepIndex, textLength: step.text?.length },
              'Text generated.'
            );
          }
        },
      });

      return { finalText: result.text, toolResults };
    } catch (error) {
      // Improve error handling for gateway/provider errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
          ? error
          : 'Unknown error occurred';

      // Check if it's a gateway/provider error
      if (
        errorMessage.includes('Gateway request failed') ||
        errorMessage.includes('Invalid error response format') ||
        errorMessage.includes('API') ||
        errorMessage.includes('provider')
      ) {
        // Log the full error for debugging
        this.logger.error(
          {
            error: errorMessage,
            errorDetails: error instanceof Error ? error.stack : String(error),
            model: this.model,
          },
          'AI provider/gateway error occurred.'
        );

        // Re-throw with a more descriptive message
        throw new Error(
          `AI provider error: ${errorMessage}. This may be due to an unsupported file type, model configuration issue, or API gateway problem.`
        );
      }

      // Re-throw other errors as-is
      throw error;
    }
  }

  private convertToolsToV6Format(
    toolDefinitions: ToolDefinition[],
    availableToolIds: ToolId[],
    invokeTool: (
      toolId: ToolId,
      args: Record<string, unknown>,
      ctx: ToolInvocationContext
    ) => Promise<ToolInvocationResult>,
    toolContextFactory: (toolId: ToolId) => ToolInvocationContext,
    toolResults: ToolInvocationResult[]
  ): Record<string, ReturnType<typeof tool>> {
    // Note: Using any here because the AI SDK's tool() function has complex generic types
    // that are difficult to infer. The actual runtime type is correct.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};

    for (const def of toolDefinitions) {
      if (!availableToolIds.includes(def.function.name)) {
        continue;
      }

      const toolId = def.function.name;
      // Convert JSON Schema to Zod schema
      const zodSchema = this.jsonSchemaToZod(def.function.parameters);

      // Create the tool according to Vercel AI SDK v6 beta format:
      // tool({ description, inputSchema: z.object(...), execute })
      // Note: The tool name comes from the key in the tools object, not a 'name' property
      tools[toolId] = tool({
        description: def.function.description,
        inputSchema: zodSchema,
        execute: async (args: Record<string, unknown>): Promise<unknown> => {
          const ctx = toolContextFactory(toolId);
          const startTime = Date.now();

          // Log tool call invocation
          ctx.logger.info(
            {
              tool: toolId,
              args: this.sanitizeArgsForLogging(args),
            },
            `Tool call: ${toolId}`
          );

          const result = await invokeTool(
            toolId,
            args as Record<string, unknown>,
            ctx
          );

          const duration = Date.now() - startTime;

          // Log tool call result
          ctx.logger.info(
            {
              tool: toolId,
              success: result.success,
              duration: `${duration}ms`,
              output: result.success
                ? this.truncateOutput(result.output)
                : result.output,
            },
            `Tool result: ${toolId} ${result.success ? 'succeeded' : 'failed'}`
          );

          // Track results for return value
          toolResults.push(result);
          // Return the output - the SDK expects a serializable value
          // Since result.output is already a JSON string, we'll parse and return it
          // or return it as-is if the SDK can handle strings
          try {
            // Try to parse as JSON to return structured data
            return JSON.parse(result.output);
          } catch {
            // If not JSON, return as string
            return result.output;
          }
        },
      });
    }

    return tools;
  }

  private jsonSchemaToZod(
    jsonSchema: Record<string, unknown>
  ): z.ZodObject<Record<string, z.ZodType<unknown>>> {
    if (jsonSchema.type !== 'object') {
      throw new Error(
        `Expected JSON Schema type 'object', got '${jsonSchema.type}'`
      );
    }

    const properties = jsonSchema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!properties) {
      return z.object({});
    }

    const zodShape: Record<string, z.ZodType<unknown>> = {};

    for (const [key, propSchema] of Object.entries(properties)) {
      zodShape[key] = this.jsonSchemaPropertyToZod(propSchema);
    }

    // Apply required fields - Zod objects are required by default, so we need to make optional fields explicitly optional
    const required = jsonSchema.required as string[] | undefined;
    const finalShape: Record<string, z.ZodType<unknown>> = {};

    for (const key of Object.keys(zodShape)) {
      if (required?.includes(key)) {
        finalShape[key] = zodShape[key];
      } else {
        finalShape[key] = zodShape[key].optional();
      }
    }

    return z.object(finalShape);
  }

  private jsonSchemaPropertyToZod(
    propSchema: Record<string, unknown>
  ): z.ZodType<unknown> {
    const type = propSchema.type as string | undefined;

    switch (type) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'integer':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(z.unknown());
      case 'object':
        return z.record(z.string(), z.unknown());
      default:
        return z.unknown();
    }
  }

  /**
   * Sanitize tool arguments for logging (remove sensitive data, truncate long values)
   */
  private sanitizeArgsForLogging(
    args: Record<string, unknown>
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string' && value.length > 200) {
        sanitized[key] = `${value.slice(0, 200)}... (truncated)`;
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Truncate tool output for logging
   */
  private truncateOutput(output: string): string {
    if (output.length > 500) {
      return `${output.slice(0, 500)}... (truncated)`;
    }
    return output;
  }
}
