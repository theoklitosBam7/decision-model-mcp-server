import * as z from "zod/v4";

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const providerFields = {
  provider: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Decision provider, for example 'ollama' or 'jev'. Uses DECISION_PROVIDER when omitted.",
    ),
  model: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Provider-specific decision model. For Ollama examples include 'nimble', 'tev1', and 'tev1:0.8b'.",
    ),
};

export const choiceQuestionSchema = z.object({
  type: z.literal("choice"),
  instructions: z.string().min(1),
  criteria: z
    .record(z.string().min(1), z.string().nullable())
    .refine((criteria) => Object.keys(criteria).length >= 2, {
      message: "Choice criteria must include at least two options.",
    }),
});

export const noulQuestionSchema = z.object({
  type: z.literal("noul"),
  instructions: z.string().min(1),
  criteria: z.object({ true: z.string().optional(), false: z.string().optional() }).optional(),
});

export const scoreQuestionSchema = z.object({
  type: z.literal("score"),
  instructions: z.string().min(1),
  criteria: z.array(z.string().min(1)).min(2).max(10),
});

export const questionSchema = z.discriminatedUnion("type", [
  choiceQuestionSchema,
  noulQuestionSchema,
  scoreQuestionSchema,
]);

export const questionsSchema = z
  .record(z.string().min(1), questionSchema)
  .refine((questions) => Object.keys(questions).length > 0, {
    message: "At least one question is required.",
  });

export const decideInputSchema = z.object({
  ...providerFields,
  state: jsonValueSchema.describe("Text or structured JSON to evaluate."),
  questions: questionsSchema.describe("Named choice, noul, or score questions."),
});

export const classifyInputSchema = z.object({
  ...providerFields,
  state: jsonValueSchema,
  labels: z
    .record(z.string().min(1), z.string().nullable())
    .refine((labels) => Object.keys(labels).length >= 2, {
      message: "Provide at least two labels.",
    }),
  instructions: z.string().min(1).default("Choose the best matching label for this state."),
});

export const booleanInputSchema = z.object({
  ...providerFields,
  state: jsonValueSchema,
  question: z.string().min(1),
  true_description: z.string().min(1).optional(),
  false_description: z.string().min(1).optional(),
});

export const scoreInputSchema = z.object({
  ...providerFields,
  state: jsonValueSchema,
  instructions: z.string().min(1),
  criteria: z.array(z.string().min(1)).min(2).max(10),
});

export const batchInputSchema = z.object({
  ...providerFields,
  states: z.array(jsonValueSchema).min(1).max(20),
  questions: questionsSchema,
  concurrency: z.number().int().min(1).max(8).default(4),
});

export const gateInputSchema = z.object({
  answers: z.record(z.string().min(1), jsonValueSchema),
  policy: z
    .object({
      min_confidence: z.number().min(0).max(1).optional(),
      noul: z
        .record(
          z.string(),
          z.object({
            block_above: z.number().min(0).max(1).optional(),
            review_above: z.number().min(0).max(1).optional(),
          }),
        )
        .optional(),
      choice: z
        .record(
          z.string(),
          z.object({
            allow: z.array(z.string()).optional(),
            review: z.array(z.string()).optional(),
            block: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
