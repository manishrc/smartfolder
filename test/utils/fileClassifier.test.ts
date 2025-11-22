import { classifyFile, detectMimeType } from '../../src/utils/fileClassifier';
import { FileCategory } from '../../src/types/FileCategory';

describe('File Classifier', () => {
  describe('classifyFile', () => {
    describe('Images', () => {
      it('should classify JPG files as images', () => {
        expect(classifyFile('photo.jpg')).toBe(FileCategory.IMAGE);
        expect(classifyFile('photo.jpeg')).toBe(FileCategory.IMAGE);
        expect(classifyFile('PHOTO.JPG')).toBe(FileCategory.IMAGE);
      });

      it('should classify PNG files as images', () => {
        expect(classifyFile('screenshot.png')).toBe(FileCategory.IMAGE);
      });

      it('should classify various image formats', () => {
        const imageExts = [
          'photo.gif',
          'icon.webp',
          'logo.svg',
          'bitmap.bmp',
          'favicon.ico',
          'iphone.heic',
          'camera.heif',
        ];
        imageExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.IMAGE);
        });
      });

      it('should classify images by MIME type', () => {
        expect(classifyFile('unknown.xyz', 'image/png')).toBe(
          FileCategory.IMAGE
        );
      });
    });

    describe('PDFs', () => {
      it('should classify PDF files', () => {
        expect(classifyFile('document.pdf')).toBe(FileCategory.PDF);
        expect(classifyFile('REPORT.PDF')).toBe(FileCategory.PDF);
      });

      it('should classify PDFs by MIME type', () => {
        expect(classifyFile('file.xyz', 'application/pdf')).toBe(
          FileCategory.PDF
        );
      });
    });

    describe('Videos', () => {
      it('should classify common video formats', () => {
        const videoExts = [
          'movie.mp4',
          'clip.avi',
          'screen.mov',
          'web.webm',
          'anime.mkv',
          'old.flv',
          'windows.wmv',
        ];
        videoExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.VIDEO);
        });
      });

      it('should classify videos by MIME type', () => {
        expect(classifyFile('unknown.xyz', 'video/mp4')).toBe(
          FileCategory.VIDEO
        );
      });
    });

    describe('Audio', () => {
      it('should classify common audio formats', () => {
        const audioExts = [
          'song.mp3',
          'audio.wav',
          'podcast.ogg',
          'itunes.m4a',
          'lossless.flac',
          'compressed.aac',
          'windows.wma',
        ];
        audioExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.AUDIO);
        });
      });

      it('should classify audio by MIME type', () => {
        expect(classifyFile('unknown.xyz', 'audio/mpeg')).toBe(
          FileCategory.AUDIO
        );
      });
    });

    describe('Office Documents', () => {
      it('should classify Microsoft Office documents', () => {
        const officeExts = [
          'report.doc',
          'report.docx',
          'sheet.xls',
          'sheet.xlsx',
          'slides.ppt',
          'slides.pptx',
        ];
        officeExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.OFFICE_DOC);
        });
      });

      it('should classify LibreOffice documents', () => {
        const libreOfficeExts = ['text.odt', 'calc.ods', 'present.odp'];
        libreOfficeExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.OFFICE_DOC);
        });
      });
    });

    describe('Archives', () => {
      it('should classify archive formats', () => {
        const archiveExts = [
          'files.zip',
          'backup.tar',
          'compressed.gz',
          'winrar.rar',
          'seven.7z',
          'tarball.tgz',
          'bzip.bz2',
        ];
        archiveExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.ARCHIVE);
        });
      });
    });

    describe('Code Files', () => {
      it('should classify JavaScript/TypeScript files', () => {
        const jsExts = ['app.js', 'types.ts', 'component.jsx', 'widget.tsx'];
        jsExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.CODE_FILE);
        });
      });

      it('should classify various programming languages', () => {
        const codeExts = [
          'script.py',
          'Main.java',
          'program.c',
          'system.cpp',
          'app.cs',
          'server.go',
          'safe.rs',
          'rails.rb',
          'web.php',
          'ios.swift',
          'android.kt',
          'functional.scala',
        ];
        codeExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.CODE_FILE);
        });
      });

      it('should classify shell scripts', () => {
        const shellExts = ['script.sh', 'bash.bash', 'zsh.zsh'];
        shellExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.CODE_FILE);
        });
      });
    });

    describe('Structured Data', () => {
      it('should classify data formats', () => {
        const dataExts = [
          'data.json',
          'config.xml',
          'settings.yaml',
          'deploy.yml',
          'cargo.toml',
          'sheet.csv',
        ];
        dataExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.STRUCTURED_DATA);
        });
      });
    });

    describe('Text Documents', () => {
      it('should classify text files', () => {
        const textExts = [
          'readme.txt',
          'docs.md',
          'guide.markdown',
          'server.log',
          'page.html',
          'page.htm',
          'style.css',
          'style.scss',
          'style.sass',
          'style.less',
        ];
        textExts.forEach(file => {
          expect(classifyFile(file)).toBe(FileCategory.TEXT_DOCUMENT);
        });
      });

      it('should classify text by MIME type', () => {
        expect(classifyFile('unknown.xyz', 'text/plain')).toBe(
          FileCategory.TEXT_DOCUMENT
        );
      });

      it('should default to text document for unknown extensions', () => {
        expect(classifyFile('unknown.xyz')).toBe(FileCategory.TEXT_DOCUMENT);
      });
    });

    describe('Edge Cases', () => {
      it('should handle files with no extension', () => {
        expect(classifyFile('README')).toBe(FileCategory.TEXT_DOCUMENT);
      });

      it('should handle files with multiple dots', () => {
        expect(classifyFile('archive.tar.gz')).toBe(FileCategory.ARCHIVE);
      });

      it('should handle uppercase extensions', () => {
        expect(classifyFile('PHOTO.JPG')).toBe(FileCategory.IMAGE);
      });

      it('should handle mixed case extensions', () => {
        expect(classifyFile('Document.PdF')).toBe(FileCategory.PDF);
      });

      it('should prefer MIME type over extension when both provided', () => {
        // File has .txt extension but image MIME type
        expect(classifyFile('fake.txt', 'image/png')).toBe(FileCategory.IMAGE);
      });
    });
  });

  describe('detectMimeType', () => {
    it('should detect MIME types for images', () => {
      expect(detectMimeType('photo.jpg')).toBe('image/jpeg');
      expect(detectMimeType('photo.png')).toBe('image/png');
      expect(detectMimeType('icon.svg')).toBe('image/svg+xml');
    });

    it('should detect MIME types for documents', () => {
      expect(detectMimeType('file.pdf')).toBe('application/pdf');
      expect(detectMimeType('doc.docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });

    it('should detect MIME types for videos', () => {
      expect(detectMimeType('video.mp4')).toBe('video/mp4');
      expect(detectMimeType('video.webm')).toBe('video/webm');
    });

    it('should detect MIME types for audio', () => {
      expect(detectMimeType('song.mp3')).toBe('audio/mpeg');
      expect(detectMimeType('audio.wav')).toBe('audio/wav');
    });

    it('should detect MIME types for archives', () => {
      expect(detectMimeType('files.zip')).toBe('application/zip');
      expect(detectMimeType('backup.tar')).toBe('application/x-tar');
    });

    it('should detect MIME types for structured data', () => {
      expect(detectMimeType('data.json')).toBe('application/json');
      expect(detectMimeType('data.xml')).toBe('application/xml');
      expect(detectMimeType('data.csv')).toBe('text/csv');
    });

    it('should return undefined for unknown extensions', () => {
      expect(detectMimeType('file.unknown')).toBeUndefined();
    });

    it('should return undefined for files without extensions', () => {
      expect(detectMimeType('README')).toBeUndefined();
    });

    it('should handle uppercase extensions', () => {
      expect(detectMimeType('PHOTO.JPG')).toBe('image/jpeg');
    });

    it('should handle files with multiple dots', () => {
      expect(detectMimeType('archive.tar.gz')).toBe('application/gzip');
    });
  });
});
