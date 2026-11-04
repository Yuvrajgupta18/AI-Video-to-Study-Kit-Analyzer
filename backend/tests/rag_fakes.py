"""Test doubles for the RAG pipeline: a deterministic embedder and lecture fixtures."""

import math
import re
import zlib

STOPWORDS = {"the", "a", "an", "of", "to", "and", "is", "are", "we", "it", "its", "in", "on", "for", "what", "how",
             "does", "do", "this", "that", "with", "by", "be", "can", "which", "about", "lecture", "say"}


class FakeEmbedder:
    """Bag-of-words vectors: texts sharing words are similar, unrelated texts score ~0."""

    def __init__(self, name="fake-embedder", dims=512):
        self.name = name
        self.dims = dims
        self.document_calls = 0
        self.query_calls = 0

    def _vector(self, text):
        vector = [0.0] * self.dims
        for word in re.findall(r"[a-z]+", text.lower()):
            if word in STOPWORDS:
                continue
            vector[zlib.crc32(word.rstrip("s").encode()) % self.dims] += 1.0
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]

    def embed_documents(self, texts):
        self.document_calls += 1
        return [self._vector(t) for t in texts]

    def embed_query(self, text):
        self.query_calls += 1
        return self._vector(text)


def seg(start, text, length=4.0):
    return {"start": start, "end": start + length, "text": text}


# ~15 words per segment so the default chunker produces several overlapping chunks.
NEURAL_NETWORKS = [
    seg(0, "Today we study neural networks, which are built from layers of simple units called neurons."),
    seg(4, "Each neuron multiplies every input by a weight, adds a bias, and applies an activation."),
    seg(8, "The activation function introduces non-linearity, otherwise stacked layers collapse into one linear model."),
    seg(12, "Sigmoid squashes values between zero and one, while ReLU outputs zero for negative inputs."),
    seg(16, "To train the network we run a forward pass and measure error with a loss function."),
    seg(20, "Regression often uses mean squared error and classification usually uses cross entropy loss."),
    seg(24, "Backpropagation applies the chain rule from calculus to compute the gradient for every weight."),
    seg(28, "Gradient descent then moves each weight a small step against its gradient to reduce loss."),
    seg(32, "The learning rate sets the step size; too large diverges and too small trains slowly."),
    seg(36, "Overfitting happens when the model memorizes training data and fails on new unseen data."),
    seg(40, "Dropout randomly switches off neurons during training, which reduces overfitting in practice."),
    seg(44, "A separate validation set lets us monitor performance and stop before overfitting gets worse."),
]

FRENCH_REVOLUTION = [
    seg(0, "The French Revolution began in 1789 when crowds stormed the Bastille prison in Paris."),
    seg(4, "The monarchy of Louis the Sixteenth collapsed under debt, famine, and popular anger."),
    seg(8, "Revolutionaries wrote the Declaration of the Rights of Man and of the Citizen."),
    seg(12, "Dropout rates from the army rose sharply as soldiers deserted to join the revolution."),
]


def transcript(segments, title="Lecture"):
    return {"title": title, "language": "en", "segments": segments}
