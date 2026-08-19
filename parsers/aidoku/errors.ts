export function sanitizeAidokuInvokeError(message: string): string {
  if (message.includes('Error 403') || /\b403\b/.test(message)) {
    return 'Access denied (HTTP 403). Try another API domain in source settings, or log in if the source requires an account.';
  }
  if (message.startsWith('JSON error') || message.includes('expected value at line 1')) {
    if (message.includes('612 bytes') || message.includes('612bytes')) {
      return 'API blocked (HTTP 403). Open source settings and pick a backup API domain (e.g. api.cdnlibs.org for MangaLib).';
    }
    return 'Unexpected response from source (not JSON). The site may be blocking requests or require login.';
  }
  if (message.includes('Unable to fetch languages')) {
    return 'Language preferences are missing. Open source settings and set your preferred languages, or reinstall the source.';
  }
  if (message.includes('Aidoku network request failed') || message.includes('Fetch failed')) {
    return 'Network request failed. Check your connection or try again later.';
  }
  return message;
}
