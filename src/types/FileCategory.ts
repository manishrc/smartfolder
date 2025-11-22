/**
 * File category enumeration for routing decisions
 */
export enum FileCategory {
  TEXT_DOCUMENT = 'text_document',
  CODE_FILE = 'code_file',
  STRUCTURED_DATA = 'structured_data',
  IMAGE = 'image',
  PDF = 'pdf',
  AUDIO = 'audio',
  VIDEO = 'video',
  OFFICE_DOC = 'office_doc',
  ARCHIVE = 'archive',
  FOLDER = 'folder',
}

/**
 * Model strengths for auto-selection
 */
export enum ModelStrength {
  LARGE_CONTEXT = 'large_context',
  FAST_INFERENCE = 'fast_inference',
  COST_EFFECTIVE = 'cost_effective',
  IMAGE_ANALYSIS = 'image_analysis',
  VIDEO_ANALYSIS = 'video_analysis',
  AUDIO_ANALYSIS = 'audio_analysis',
  CODE_GENERATION = 'code_generation',
  STRUCTURED_OUTPUT = 'structured_output',
}
