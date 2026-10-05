import * as z from "zod/v4";

const MAX_TEXT_LENGTH = 32_768;
const MAX_DESCRIPTION_LENGTH = 4_096;
const MAX_NAME_LENGTH = 128;
const MAX_RECORD_KEYS = 100;
const MAX_QUESTIONS = 50;
const MAX_PAYLOAD_BYTES = 1_048_576;

const withinPayloadLimit = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return serialized !== undefined && Buffer.byteLength(serialized) <= MAX_PAYLOAD_BYTES;
};

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(MAX_TEXT_LENGTH),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema).max(1_000),
    z
      .record(z.string().min(1).max(MAX_NAME_LENGTH), jsonValueSchema)
      .refine((value) => Object.keys(value).length <= MAX_RECORD_KEYS, {
        message: `JSON objects may contain at most ${MAX_RECORD_KEYS} keys.`,
      }),
  ]),
);

const providerFields = {
  provider: z
    .string()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .optional()
    .describe(
      "Decision provider, for example 'ollama' or 'jev'. Uses DECISION_PROVIDER when omitted.",
    ),
  model: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      "Provider-specific decision model. For Ollama examples include 'nimble', 'tev1', and 'tev1:0.8b'.",
    ),
};

export const choiceQuestionSchema = z.object({
  type: z.literal("choice"),
  instructions: z.string().min(1).max(MAX_TEXT_LENGTH),
  criteria: z
    .record(
      z.string().min(1).max(MAX_NAME_LENGTH),
      z.string().max(MAX_DESCRIPTION_LENGTH).nullable(),
    )
    .refine((criteria) => Object.keys(criteria).length >= 2, {
      message: "Choice criteria must include at least two options.",
    })
    .refine((criteria) => Object.keys(criteria).length <= 50, {
      message: "Choice criteria may include at most 50 options.",
    }),
});

export const noulQuestionSchema = z.object({
  type: z.literal("noul"),
  instructions: z.string().min(1).max(MAX_TEXT_LENGTH),
  criteria: z
    .object({
      true: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
      false: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    })
    .optional(),
});

export const scoreQuestionSchema = z.object({
  type: z.literal("score"),
  instructions: z.string().min(1).max(MAX_TEXT_LENGTH),
  criteria: z.array(z.string().min(1).max(MAX_DESCRIPTION_LENGTH)).min(2).max(10),
});

export const questionSchema = z.discriminatedUnion("type", [
  choiceQuestionSchema,
  noulQuestionSchema,
  scoreQuestionSchema,
]);

export const questionsSchema = z
  .record(z.string().min(1).max(MAX_NAME_LENGTH), questionSchema)
  .refine((questions) => Object.keys(questions).length > 0, {
    message: "At least one question is required.",
  })
  .refine((questions) => Object.keys(questions).length <= MAX_QUESTIONS, {
    message: `At most ${MAX_QUESTIONS} questions are allowed.`,
  });

export const decideInputSchema = z
  .object({
    ...providerFields,
    state: jsonValueSchema.describe("Text or structured JSON to evaluate."),
    questions: questionsSchema.describe("Named choice, noul, or score questions."),
  })
  .refine(withinPayloadLimit, { message: "Request payload is too large." });

export const classifyInputSchema = z
  .object({
    ...providerFields,
    state: jsonValueSchema,
    labels: z
      .record(
        z.string().min(1).max(MAX_NAME_LENGTH),
        z.string().max(MAX_DESCRIPTION_LENGTH).nullable(),
      )
      .refine((labels) => Object.keys(labels).length >= 2, {
        message: "Provide at least two labels.",
      })
      .refine((labels) => Object.keys(labels).length <= 50, {
        message: "Provide at most 50 labels.",
      }),
    instructions: z
      .string()
      .min(1)
      .max(MAX_TEXT_LENGTH)
      .default("Choose the best matching label for this state."),
  })
  .refine(withinPayloadLimit, { message: "Request payload is too large." });

export const booleanInputSchema = z
  .object({
    ...providerFields,
    state: jsonValueSchema,
    question: z.string().min(1).max(MAX_TEXT_LENGTH),
    true_description: z.string().min(1).max(MAX_DESCRIPTION_LENGTH).optional(),
    false_description: z.string().min(1).max(MAX_DESCRIPTION_LENGTH).optional(),
  })
  .refine(withinPayloadLimit, { message: "Request payload is too large." });

export const scoreInputSchema = z
  .object({
    ...providerFields,
    state: jsonValueSchema,
    instructions: z.string().min(1).max(MAX_TEXT_LENGTH),
    criteria: z.array(z.string().min(1).max(MAX_DESCRIPTION_LENGTH)).min(2).max(10),
  })
  .refine(withinPayloadLimit, { message: "Request payload is too large." });

export const batchInputSchema = z
  .object({
    ...providerFields,
    states: z.array(jsonValueSchema).min(1).max(20),
    questions: questionsSchema,
    concurrency: z.number().int().min(1).max(8).default(4),
  })
  .refine(withinPayloadLimit, { message: "Request payload is too large." });

export const gateInputSchema = z
  .object({
    answers: z
      .record(z.string().min(1).max(MAX_NAME_LENGTH), jsonValueSchema)
      .refine((answers) => Object.keys(answers).length <= MAX_QUESTIONS, {
        message: `At most ${MAX_QUESTIONS} answers are allowed.`,
      }),
    policy: z
      .object({
        min_confidence: z.number().min(0).max(1).optional(),
        noul: z
          .record(
            z.string().min(1).max(MAX_NAME_LENGTH),
            z.object({
              block_above: z.number().min(0).max(1).optional(),
              review_above: z.number().min(0).max(1).optional(),
            }),
          )
          .optional(),
        choice: z
          .record(
            z.string().min(1).max(MAX_NAME_LENGTH),
            z.object({
              allow: z.array(z.string().max(MAX_NAME_LENGTH)).max(100).optional(),
              review: z.array(z.string().max(MAX_NAME_LENGTH)).max(100).optional(),
              block: z.array(z.string().max(MAX_NAME_LENGTH)).max(100).optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  })
  .refine(withinPayloadLimit, { message: "Gate payload is too large." });
