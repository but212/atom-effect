export const SUBMISSION_DELAY_MS = 1500;
export const SUBMISSION_RESET_DELAY_MS = 3000;
export const SUBMISSION_FAILURE_MESSAGE = 'DATABASE_TIMEOUT: Failed to persist changes.';

export function createSubmissionOutcome(randomValue, timestamp) {
  if (randomValue > 0.7) {
    return { status: 'rejected', message: SUBMISSION_FAILURE_MESSAGE };
  }

  return { status: 'resolved', value: { success: true, timestamp } };
}

export async function runSubmission({
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  random = () => Math.random(),
  now = () => new Date(),
} = {}) {
  await wait(SUBMISSION_DELAY_MS);
  return createSubmissionOutcome(random(), now().toISOString());
}

export function getSubmissionPresentation(state) {
  switch (state.status) {
    case 'pending':
      return {
        status: 'pending',
        visible: true,
        disabled: true,
        buttonText: 'SAVING...',
      };
    case 'rejected':
      return {
        status: 'rejected',
        visible: true,
        disabled: false,
        buttonText: 'Retry Save',
        errorMessage: state.message || 'Unknown error',
      };
    case 'resolved': {
      const time = state.value?.timestamp?.split('T')[1]?.split('.')[0] ?? '';
      return {
        status: 'resolved',
        visible: Boolean(state.value),
        disabled: false,
        buttonText: 'Save Profiles',
        time,
      };
    }
    default:
      return {
        status: 'idle',
        visible: false,
        disabled: false,
        buttonText: 'Save Profiles',
      };
  }
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
