export function fitEmbeddingDimensions(vector: number[], dimensions: number): number[] {
  if (!Array.isArray(vector) || vector.length < dimensions) {
    throw new Error(`The embedding provider returned an unexpected vector shape (expected ${dimensions} dimensions).`);
  }
  if (vector.length === dimensions) return vector;
  const values = vector.slice(0, dimensions);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? values.map((value) => value / norm) : values;
}
