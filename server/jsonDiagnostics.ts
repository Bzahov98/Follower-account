/**
 * JSON Diagnostic and Validation Utilities
 * Provides rich, human-friendly error descriptions instead of generic JSON.parse syntax errors.
 */

export interface JsonDiagnosticResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  technicalDetails?: string;
  detectedFormat: 'valid_json' | 'html_export' | 'xml_export' | 'empty_file' | 'binary_data' | 'malformed_json';
  previewSnippet?: string;
  troubleshooting?: string;
}

/**
 * Analyzes raw content before and during JSON parsing to provide deep diagnostic information
 * on what actually happened (HTML export vs empty file vs binary vs malformed syntax).
 */
export function analyzeAndParseJson<T = any>(
  rawContent: string | Buffer | null | undefined,
  fileName: string = 'Uploaded file'
): JsonDiagnosticResult<T> {
  if (rawContent === null || rawContent === undefined) {
    return {
      success: false,
      detectedFormat: 'empty_file',
      error: `File "${fileName}" is empty or undefined.`,
      technicalDetails: 'No content was received by the server parser.',
      previewSnippet: '',
      troubleshooting: 'Please check your file and try uploading again.'
    };
  }

  // Convert buffer or string to clean string
  let text = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
  
  // Strip BOM (Byte Order Mark) if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const trimmed = text.trim();

  // 1. Check for empty content
  if (!trimmed) {
    return {
      success: false,
      detectedFormat: 'empty_file',
      error: `File "${fileName}" is completely empty (0 bytes).`,
      technicalDetails: 'The file contains no readable text, characters, or JSON structure.',
      previewSnippet: '[Empty File]',
      troubleshooting: 'Make sure your Instagram export download finished completely before extracting and uploading files.'
    };
  }

  const lowerTrimmed = trimmed.toLowerCase();

  // 2. Check for HTML export format (the #1 most common issue from Meta Accounts Center)
  if (
    lowerTrimmed.startsWith('<!doctype html') ||
    lowerTrimmed.startsWith('<html') ||
    lowerTrimmed.startsWith('<head') ||
    lowerTrimmed.startsWith('<body') ||
    (trimmed.startsWith('<') && (lowerTrimmed.includes('<div') || lowerTrimmed.includes('<span') || lowerTrimmed.includes('<!doctype') || lowerTrimmed.includes('</html>')))
  ) {
    const preview = trimmed.slice(0, 160).replace(/\r?\n/g, ' ');
    return {
      success: false,
      detectedFormat: 'html_export',
      error: `File "${fileName}" is an HTML document, not a JSON file.`,
      technicalDetails: `Expected JSON object or array starting with '{' or '[', but found HTML tags. First characters received: "${preview}..."`,
      previewSnippet: preview,
      troubleshooting: 'In Meta Accounts Center, the default format is HTML. To fix this: Go to Meta Accounts Center > Your information and permissions > Download your information > Change format to "JSON", then download and upload the new JSON archive.'
    };
  }

  // 3. Check for XML format
  if (lowerTrimmed.startsWith('<?xml') || (trimmed.startsWith('<') && lowerTrimmed.includes('</'))) {
    const preview = trimmed.slice(0, 160).replace(/\r?\n/g, ' ');
    return {
      success: false,
      detectedFormat: 'xml_export',
      error: `File "${fileName}" is an XML file instead of a JSON file.`,
      technicalDetails: `Found XML markup: "${preview}..."`,
      previewSnippet: preview,
      troubleshooting: 'Instagram data must be exported in JSON format.'
    };
  }

  // 4. Check for binary / compressed archive signatures inside text
  if (trimmed.startsWith('PK\x03\x04') || trimmed.includes('\0\0\0')) {
    return {
      success: false,
      detectedFormat: 'binary_data',
      error: `File "${fileName}" contains raw binary or compressed ZIP data.`,
      technicalDetails: 'Found binary ZIP header (PK) or null bytes in a file being parsed as text.',
      previewSnippet: '[Binary Data / ZIP Header]',
      troubleshooting: 'If you uploaded a .zip file renamed to .json, please upload it as a .zip file or extract it first.'
    };
  }

  // 5. Attempt JSON parsing
  try {
    const parsed = JSON.parse(trimmed);
    return {
      success: true,
      data: parsed,
      detectedFormat: 'valid_json'
    };
  } catch (parseErr: any) {
    const errMsg = parseErr?.message || 'SyntaxError during JSON parsing';
    const preview = trimmed.slice(0, 160).replace(/\r?\n/g, ' ');

    let specificCause = 'The file contains malformed JSON syntax or unexpected characters.';
    if (trimmed.startsWith('<')) {
      specificCause = 'The file appears to contain HTML/web page content instead of JSON objects.';
    } else if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      specificCause = 'The JSON file appears to be cut off or truncated before completing.';
    } else if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      specificCause = 'The JSON array appears to be cut off or truncated before completing.';
    }

    return {
      success: false,
      detectedFormat: 'malformed_json',
      error: `Failed to parse JSON in "${fileName}": ${specificCause}`,
      technicalDetails: `Exact parser error: ${errMsg}. First characters: "${preview}..."`,
      previewSnippet: preview,
      troubleshooting: 'Ensure the file is an unmodified JSON file from Instagram and has not been truncated or saved with extra text.'
    };
  }
}
