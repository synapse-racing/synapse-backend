export interface NeatGenome {
  id: string;
  nodes: Array<{
    id: number;
    type: 'input' | 'bias' | 'hidden' | 'output';
    layer: number;
  }>;
  connections: Array<{
    innovation: number;
    source: number;
    target: number;
    weight: number;
    enabled: boolean;
  }>;
}

export function parseNeatGenome(value: unknown): NeatGenome {
  if (!value || typeof value !== 'object') throw new Error('Invalid genome');
  const genome = value as NeatGenome;
  if (
    typeof genome.id !== 'string' ||
    !Array.isArray(genome.nodes) ||
    !Array.isArray(genome.connections) ||
    genome.nodes.length > 128 ||
    genome.connections.length > 2048
  ) {
    throw new Error('Invalid genome');
  }
  const ids = new Set<number>();
  for (const node of genome.nodes) {
    if (
      !Number.isSafeInteger(node.id) ||
      !Number.isFinite(node.layer) ||
      !['input', 'bias', 'hidden', 'output'].includes(node.type) ||
      ids.has(node.id)
    ) {
      throw new Error('Invalid genome nodes');
    }
    ids.add(node.id);
  }
  if (
    genome.nodes.filter((node) => node.type === 'input').length !== 6 ||
    genome.nodes.filter((node) => node.type === 'output').length !== 2
  ) {
    throw new Error('Genome must have 6 inputs and 2 outputs');
  }
  for (const connection of genome.connections) {
    const source = genome.nodes.find((node) => node.id === connection.source);
    const target = genome.nodes.find((node) => node.id === connection.target);
    if (
      !Number.isFinite(connection.weight) ||
      typeof connection.enabled !== 'boolean' ||
      !source ||
      !target ||
      source.layer >= target.layer
    ) {
      throw new Error('Invalid genome connections');
    }
  }
  return structuredClone(genome);
}

export function evaluateNeatGenome(
  genome: NeatGenome,
  inputs: readonly number[],
): [number, number] {
  const values = new Map<number, number>();
  genome.nodes
    .filter((node) => node.type === 'input')
    .sort((a, b) => a.id - b.id)
    .forEach((node, index) => values.set(node.id, inputs[index] ?? 0));
  genome.nodes
    .filter((node) => node.type === 'bias')
    .forEach((node) => values.set(node.id, 1));
  for (const node of genome.nodes
    .filter((candidate) => ['hidden', 'output'].includes(candidate.type))
    .sort((a, b) => a.layer - b.layer || a.id - b.id)) {
    const sum = genome.connections
      .filter(
        (connection) => connection.enabled && connection.target === node.id,
      )
      .reduce(
        (total, connection) =>
          total + (values.get(connection.source) ?? 0) * connection.weight,
        0,
      );
    values.set(node.id, Math.tanh(sum));
  }
  const outputs = genome.nodes
    .filter((node) => node.type === 'output')
    .sort((a, b) => a.id - b.id)
    .map((node) => values.get(node.id) ?? 0);
  return [outputs[0], outputs[1]];
}
