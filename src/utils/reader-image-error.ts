import { t } from '@/constants/locales';

export function describeImageLoadError(error?: unknown): string {
  const text = errorText(error);
  if (!text) return t('reader_image_failed');

  const lower = text.toLowerCase();
  const status = lower.match(/\b(?:status(?:\s*code)?\s*[:=]?\s*|http\s+)?(401|403|404|408|429|500|502|503|504)\b/)?.[1];

  if (status === '401' || status === '403' || lower.includes('forbidden') || lower.includes('unauthorized')) {
    return status ? t('reader_image_error_denied_status', { status }) : t('reader_image_error_denied');
  }
  if (status === '404' || lower.includes('not found') || lower.includes('no such file')) {
    return t('reader_image_error_missing');
  }
  if (status === '429' || lower.includes('too many')) {
    return t('reader_image_error_rate_limit');
  }
  if (status === '408' || lower.includes('timeout') || lower.includes('timed out') || lower.includes('timedout')) {
    return t('reader_image_error_timeout');
  }
  if (
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('internet') ||
    lower.includes('connection') ||
    lower.includes('could not connect') ||
    lower.includes('failed to connect') ||
    lower.includes('load failed')
  ) {
    return t('reader_image_error_network');
  }
  if (status === '500' || status === '502' || status === '503' || status === '504') {
    return t('reader_image_error_server_status', { status });
  }
  if (lower.includes('decode') || lower.includes('corrupt') || lower.includes('invalid image')) {
    return t('reader_image_error_decode');
  }

  return t('reader_image_failed');
}

function errorText(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error.trim();
  if (typeof error === 'object') {
    if ('error' in error) return errorText((error as { error: unknown }).error);
    if ('message' in error) return errorText((error as { message: unknown }).message);
  }
  return String(error).trim();
}
