const BASE_SCHEMA_PATH = '../../schemas/';

export const tcSnapshotManifestExpectations = Object.freeze({
  rule110: {
    manifestType: 'tc.rule110.snapshot',
    schema: `${BASE_SCHEMA_PATH}tc_rule110_snapshot.schema.json`,
    requiredFields: ['type', 'tick', 'width', 'cells'],
    description:
      'Captures the binary cell pattern of a Rule 110 evolution step. Cells are serialized as 0/1 integers with optional metadata.',
    optionalFields: ['origin', 'metadata']
  },
  turingTape: {
    manifestType: 'tc.turing_tape.snapshot',
    schema: `${BASE_SCHEMA_PATH}tc_tape_snapshot.schema.json`,
    requiredFields: ['type', 'tick', 'head', 'tape'],
    description:
      'Captures a deterministic single-tape Turing machine configuration with head position/state and a finite tape window.',
    optionalFields: ['window', 'metadata']
  }
});

export function getTcSnapshotExpectation(key) {
  return tcSnapshotManifestExpectations[key] ?? null;
}

export function listTcSnapshotManifestTypes() {
  return Object.values(tcSnapshotManifestExpectations).map((entry) => entry.manifestType);
}
