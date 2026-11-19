// AI validation acceptance tests. Run with Node's TypeScript type stripping.
// Covers invented-deadline guards, OCR fallback, priority authority and action validation.
import assert from "node:assert/strict";
import { inferMimeType } from "../lib/ai/mime.ts";
import {
  assistantActionSchema,
  extractionSchema,
  sanitizeExtraction,
  taskBreakdownSchema
} from "../lib/ai/schemas.ts";
import { hasTemporalCue } from "../lib/ai/temporal.ts";
import { fitEmbeddingDimensions } from "../lib/ai/embedding.ts";

let pass = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.log(`FAIL  ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function baseTask(overrides = {}) {
  return {
    title: "Submit the report",
    description: "",
    deadline_date: "2027-03-15",
    deadline_time: "17:00",
    deadline_source_text: "by 15 March 2027",
    deadline_confidence: "high",
    priority_hint: "critical",
    category_hint: "Work",
    project_hint: null,
    tags: ["report"],
    estimated_minutes: 30,
    ...overrides
  };
}

function extraction(tasks, ocrText = "") {
  return {
    language: "en",
    summary: "A report needs to be submitted.",
    suggested_title: "Report submission",
    ocr_text: ocrText,
    tasks,
    notes: [],
    key_facts: [],
    people: [],
    connections: [],
    warnings: []
  };
}

test("keeps a deadline backed by exact source wording", () => {
  const result = sanitizeExtraction(
    extraction([baseTask()]),
    "Please submit the report by 15 March 2027 at 5 PM."
  );
  assert.equal(result.tasks[0].deadline_date, "2027-03-15");
  assert.equal(result.tasks[0].deadline_time, "17:00");
  assert.equal(result.tasks[0].deadline_source_text, "by 15 March 2027");
  assert.equal(result.tasks[0].deadline_confidence, "high");
});

test("removes an invented deadline not present in the source", () => {
  const result = sanitizeExtraction(
    extraction([baseTask({ deadline_source_text: "next Friday" })]),
    "Please submit the report soon."
  );
  assert.equal(result.tasks[0].deadline_date, null);
  assert.equal(result.tasks[0].deadline_time, null);
  assert.equal(result.tasks[0].deadline_confidence, "none");
  assert.match(result.warnings.join(" "), /deadline was removed/i);
});

test("removes a deadline when no source phrase was supplied", () => {
  const result = sanitizeExtraction(
    extraction([baseTask({ deadline_source_text: null })]),
    "The report is due on 15 March 2027."
  );
  assert.equal(result.tasks[0].deadline_date, null);
});

test("matches source text case-insensitively with collapsed whitespace", () => {
  const result = sanitizeExtraction(
    extraction([baseTask({ deadline_source_text: "BY   15 march 2027" })]),
    "Submit BY 15 MARCH 2027 please."
  );
  assert.equal(result.tasks[0].deadline_date, "2027-03-15");
});

test("uses OCR text when extracted source text is empty", () => {
  const result = sanitizeExtraction(
    extraction([baseTask({ deadline_date: "2026-12-01", deadline_source_text: "2026-12-01" })], "Pay the invoice on 2026-12-01."),
    " "
  );
  assert.equal(result.tasks[0].deadline_date, "2026-12-01");
  assert.equal(result.tasks[0].deadline_source_text, "2026-12-01");
});

test("never accepts an impossible calendar date", () => {
  const result = sanitizeExtraction(
    extraction([baseTask({ deadline_date: "2026-02-31", deadline_source_text: "31 February 2026" })]),
    "The deadline is 31 February 2026."
  );
  assert.equal(result.tasks[0].deadline_date, null);
});

test("always resets AI priority hints to normal", () => {
  const result = sanitizeExtraction(
    extraction([
      baseTask({ priority_hint: "critical" }),
      baseTask({ title: "Second task", priority_hint: "high", deadline_source_text: null })
    ]),
    "Please submit the report by 15 March 2027."
  );
  assert.deepEqual(result.tasks.map((task) => task.priority_hint), ["normal", "normal"]);
});

test("gives an empty suggested title a safe fallback", () => {
  const raw = extraction([], "");
  raw.suggested_title = "";
  const result = sanitizeExtraction(raw, "Plain capture");
  assert.equal(result.suggested_title, "Untitled capture");
});

test("extraction schema caps task count and applies safe defaults", () => {
  const raw = extraction([]);
  raw.tasks = Array.from({ length: 31 }, (_, index) => baseTask({ title: `Task ${index}` }));
  assert.throws(() => extractionSchema.parse(raw));
});

test("assistant action accepts a valid create-task payload", () => {
  const action = assistantActionSchema.parse({
    type: "create_task",
    label: "Create report task",
    payload: { title: "Submit report", deadline_date: "2027-03-15", tags: ["work"] }
  });
  assert.equal(action.type, "create_task");
  assert.equal(action.payload.deadline_date, "2027-03-15");
});

test("assistant action rejects an invalid deadline format", () => {
  assert.throws(() => assistantActionSchema.parse({
    type: "create_task",
    label: "Create report task",
    payload: { title: "Submit report", deadline_date: "15/03/2027" }
  }));
});

test("assistant action rejects an unknown action type", () => {
  assert.throws(() => assistantActionSchema.parse({
    type: "delete_everything",
    label: "Delete all",
    payload: {}
  }));
});

test("task breakdown requires at least one subtask", () => {
  assert.throws(() => taskBreakdownSchema.parse({ subtasks: [], note: "" }));
  const parsed = taskBreakdownSchema.parse({
    subtasks: [{ title: "Draft outline", estimated_minutes: 20 }],
    note: ""
  });
  assert.equal(parsed.subtasks[0].rationale, "");
});

test("task breakdown caps at fifteen subtasks", () => {
  assert.throws(() => taskBreakdownSchema.parse({
    subtasks: Array.from({ length: 16 }, (_, index) => ({ title: `Step ${index}`, estimated_minutes: 5, rationale: "" })),
    note: ""
  }));
});

test("temporal guard rejects bare urgency words and the verb may", () => {
  assert.equal(hasTemporalCue("Please add a task for the report. It may be urgent."), false);
  assert.equal(hasTemporalCue("This has a deadline and is due soon."), false);
});

test("temporal guard accepts explicit dates and relative dates", () => {
  assert.equal(hasTemporalCue("Add it by 15 March"), true);
  assert.equal(hasTemporalCue("I need this tomorrow"), true);
  assert.equal(hasTemporalCue("Schedule the review next Friday"), true);
  assert.equal(hasTemporalCue("Finish it in 3 days"), true);
  assert.equal(hasTemporalCue("Remind me on 2027-01-09"), true);
});

test("temporal guard rejects a bare Hindi word that is not a date", () => {
  assert.equal(hasTemporalCue("इस काम को करो"), false);
  assert.equal(hasTemporalCue("कल कर दो"), true);
});

test("upload MIME inference repairs empty and aliased browser types", () => {
  assert.equal(inferMimeType("voice.m4a", ""), "audio/mp4");
  assert.equal(inferMimeType("photo.jpg", "application/octet-stream"), "image/jpeg");
  assert.equal(inferMimeType("photo.jpg", "image/jpg"), "image/jpeg");
  assert.equal(inferMimeType("clip.m4a", "audio/x-m4a"), "audio/mp4");
  assert.equal(inferMimeType("report.pdf", "application/pdf"), "application/pdf");
});

test("embedding vectors are truncated and renormalized for pgvector", () => {
  const vector = Array.from({ length: 3072 }, (_, index) => (index % 7) - 3);
  const fitted = fitEmbeddingDimensions(vector, 1536);
  assert.equal(fitted.length, 1536);
  const norm = Math.sqrt(fitted.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);
});

test("embedding vectors shorter than the stored dimension are rejected", () => {
  assert.throws(() => fitEmbeddingDimensions([0.1, 0.2], 1536));
});

console.log(`\n${pass}/${total} AI validation tests passed.`);
process.exit(pass === total ? 0 : 1);
