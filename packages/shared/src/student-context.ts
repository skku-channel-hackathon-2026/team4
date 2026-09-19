import { z } from "zod";

const ref = z
  .object({
    messageIndex: z.number().int().nonnegative(),
    quote: z.string().min(1).max(2000),
  })
  .strict();
export const ContextItemSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/),
    topic: z.string().min(1).max(100),
    kind: z.enum([
      "fact",
      "goal",
      "preference",
      "constraint",
      "hypothesis",
      "unknown",
    ]),
    value: z.string().max(1000),
    status: z.enum(["stated", "inferred", "missing", "unsure", "withheld"]),
    evidence: z.array(ref).max(12),
  })
  .strict()
  .superRefine((item, ctx) => {
    const valid =
      item.kind === "unknown"
        ? ["missing", "unsure", "withheld"].includes(item.status) &&
          item.value === ""
        : item.kind === "hypothesis"
          ? item.status === "inferred" && item.value.trim().length > 0
          : item.status === "stated" && item.value.trim().length > 0;
    if (!valid)
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent context kind/status/value",
      });
    if (item.status !== "missing" && !item.evidence.length)
      ctx.addIssue({
        code: "custom",
        message: "Context claims require evidence",
      });
    if (item.status === "missing" && item.evidence.length)
      ctx.addIssue({
        code: "custom",
        message: "Missing is absence of information, not a quoted claim",
      });
  });
export type ContextItem = z.infer<typeof ContextItemSchema>;
export const StudentContextSchema = z
  .object({
    version: z.literal("1.0"),
    items: z.array(ContextItemSchema).max(80),
    askedTopicIds: z.array(z.string()).max(80),
  })
  .strict();
export type StudentContext = z.infer<typeof StudentContextSchema>;
export const ContextDeltaSchema = z
  .object({
    upsert: z.array(ContextItemSchema).max(40),
    remove: z
      .array(
        z
          .object({ id: z.string(), evidence: z.array(ref).min(1).max(12) })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type ContextDelta = z.infer<typeof ContextDeltaSchema>;
