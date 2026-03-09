/**
 * Gemini API Error Classification
 * 
 * Classifies errors for user-friendly status display and guidance
 */

export type GeminiErrorType = 
  | 'invalid_key'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'network'
  | 'unknown';

export interface ClassifiedError {
  type: GeminiErrorType;
  message: string;
  userMessage: string;
  retryable: boolean;
}

/**
 * Classify Gemini API errors for user-facing status
 */
export function classifyGeminiError(error: unknown): ClassifiedError {
  const errorStr = String(error).toLowerCase();
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Invalid API key
  if (
    errorStr.includes('api key not valid') ||
    errorStr.includes('api_key_invalid') ||
    errorStr.includes('invalid api key') ||
    errorStr.includes('unauthorized') ||
    errorStr.includes('401')
  ) {
    return {
      type: 'invalid_key',
      message: errorMessage,
      userMessage: 'Invalid API key. Please check your key in Settings.',
      retryable: false,
    };
  }
  
  // Rate limited
  if (
    errorStr.includes('rate limit') ||
    errorStr.includes('too many requests') ||
    errorStr.includes('429') ||
    errorStr.includes('quota exceeded for quota metric')
  ) {
    return {
      type: 'rate_limited',
      message: errorMessage,
      userMessage: 'Rate limit reached. Please wait a moment and try again.',
      retryable: true,
    };
  }
  
  // Quota exhausted
  if (
    errorStr.includes('quota') ||
    errorStr.includes('billing') ||
    errorStr.includes('exceeded your current quota') ||
    errorStr.includes('insufficient quota')
  ) {
    return {
      type: 'quota_exhausted',
      message: errorMessage,
      userMessage: 'API quota exhausted. Please check your Gemini API quota.',
      retryable: false,
    };
  }
  
  // Network errors
  if (
    errorStr.includes('fetch') ||
    errorStr.includes('network') ||
    errorStr.includes('timeout') ||
    errorStr.includes('connection') ||
    errorStr.includes('enotfound') ||
    errorStr.includes('econnrefused')
  ) {
    return {
      type: 'network',
      message: errorMessage,
      userMessage: 'Network error. Please check your internet connection.',
      retryable: true,
    };
  }
  
  // Unknown error
  return {
    type: 'unknown',
    message: errorMessage,
    userMessage: 'An unexpected error occurred. Please try again.',
    retryable: true,
  };
}

/**
 * Get user-friendly status message
 */
export function getStatusMessage(errorType: GeminiErrorType | null): string {
  if (!errorType) return 'Connected';
  
  switch (errorType) {
    case 'invalid_key':
      return 'Invalid API Key';
    case 'rate_limited':
      return 'Rate Limited';
    case 'quota_exhausted':
      return 'Quota Exhausted';
    case 'network':
      return 'Network Error';
    case 'unknown':
      return 'Error';
    default:
      return 'Unknown Status';
  }
}

/**
 * Get guidance URL for error types
 */
export function getGuidanceUrl(errorType: GeminiErrorType): string | null {
  switch (errorType) {
    case 'invalid_key':
      return 'https://aistudio.google.com/app/apikey';
    case 'quota_exhausted':
      return 'https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas';
    case 'rate_limited':
      return 'https://ai.google.dev/gemini-api/docs/quota-rate-limits';
    default:
      return null;
  }
}
