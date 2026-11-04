export const SEGMENTS = [
  { start: 0, end: 3.08, text: "Welcome to today's lecture on machine learning." },
  { start: 3.08, end: 5.4, text: 'We will cover supervised learning where models' },
  { start: 5.4, end: 7.88, text: 'learn from labeled examples.' },
  { start: 7.88, end: 10.14, text: 'Next, we will discuss grade in descent' },
  { start: 10.14, end: 13.44, text: 'an optimization method that minimizes a loss function.' },
]

export const NOTES = {
  summary: 'An introduction to supervised learning and gradient descent.',
  sections: [
    {
      title: 'Supervised learning',
      summary: 'Learning from labeled data.',
      points: ['Models learn from labeled examples.'],
      sources: [{ start: 3.08, end: 7.88 }],
    },
    {
      title: 'Gradient descent',
      summary: 'An optimization method.',
      points: ['Minimizes a loss function.', 'Used to train models.'],
      sources: [{ start: 7.88, end: 13.44 }],
    },
  ],
  concepts: [{ term: 'Gradient descent', definition: 'Minimizes a loss function.', sources: [{ start: 7.88, end: 13.44 }] }],
  takeaways: [{ text: 'Labeled data drives supervised learning.', sources: [] }],
  model: 'gemini-3.6-flash',
  generated_at: '2026-10-26T10:30:35+00:00',
}

let counter = 0

export function makeLecture(overrides = {}) {
  counter += 1
  return {
    id: `lecture-${counter}`,
    title: 'ML Basics',
    fileName: 'ml-basics.mp3',
    fileSize: 1024,
    mediaType: 'audio',
    language: 'en',
    segments: SEGMENTS,
    transcript: SEGMENTS.map((s) => s.text).join(' '),
    duration: 13.44,
    wordCount: 33,
    createdAt: '2026-10-26T10:00:00.000Z',
    ...overrides,
  }
}

export const FLASHCARDS = {
  cards: [
    {
      id: 'card-1',
      question: 'What is supervised learning?',
      answer: 'Learning from labeled examples.',
      difficulty: 'easy',
      topic: 'Supervised learning',
      segment_ids: [1, 2],
      sources: [{ start: 3.08, end: 7.88 }],
    },
    {
      id: 'card-2',
      question: 'What does gradient descent minimize?',
      answer: 'A loss function.',
      difficulty: 'medium',
      topic: 'Optimization',
      segment_ids: [3, 4],
      sources: [{ start: 7.88, end: 13.44 }],
    },
    {
      id: 'card-3',
      question: 'Why do models need labeled data, "in general"?',
      answer: '=Labels provide the target, so the model can learn, check, and correct.',
      difficulty: 'hard',
      topic: 'Supervised learning',
      segment_ids: [2],
      sources: [{ start: 5.4, end: 7.88 }],
    },
  ],
  model: 'gemini-3.6-flash',
  generated_at: '2026-10-26T11:00:00+00:00',
}

export const QUIZ = {
  questions: [
    {
      id: 'q-1',
      question: 'What do supervised models learn from?',
      options: ['Unlabeled data', 'Labeled examples', 'Random noise', 'Rewards'],
      correct_index: 1,
      explanation: 'The lecture says models learn from labeled examples.',
      difficulty: 'easy',
      topic: 'Supervised learning',
      segment_ids: [1, 2],
      sources: [{ start: 3.08, end: 7.88 }],
    },
    {
      id: 'q-2',
      question: 'What does gradient descent minimize?',
      options: ['The dataset size', 'The learning rate', 'A loss function', 'The number of labels'],
      correct_index: 2,
      explanation: 'Gradient descent is an optimization method that minimizes a loss function.',
      difficulty: 'medium',
      topic: 'Optimization',
      segment_ids: [3, 4],
      sources: [{ start: 7.88, end: 13.44 }],
    },
    {
      id: 'q-3',
      question: 'Why does supervised learning need labels?',
      options: ['Labels give the target to learn', 'Labels speed up GPUs', 'Labels remove the loss', 'Labels replace data'],
      correct_index: 0,
      explanation: 'Models learn from labeled examples, so labels provide the target.',
      difficulty: 'hard',
      topic: 'Supervised learning',
      segment_ids: [2],
      sources: [{ start: 5.4, end: 7.88 }],
    },
  ],
  requested: 5,
  model: 'gemini-3.6-flash',
  generated_at: '2026-10-26T12:00:00+00:00',
}

export const ANSWER = {
  answer: 'Gradient descent minimizes a loss function [1]. It is an optimization method [1].',
  answerable: true,
  citations: [
    {
      id: 1,
      chunk_id: 'lecture-x::abc::00001',
      start: 7.88,
      end: 13.44,
      segment_ids: [3, 4],
      excerpt: 'Next, we will discuss grade in descent an optimization method that minimizes a loss function.',
    },
  ],
  model: 'gemini-3.6-flash',
  retrieved: 2,
}

export const INDEX_RESULT = {
  lecture_id: 'x',
  indexed: true,
  up_to_date: true,
  transcript_hash: 'a'.repeat(64),
  chunk_count: 3,
  embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
  indexed_at: '2026-10-27T00:00:00+00:00',
  reindexed: true,
}
