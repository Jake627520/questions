import { z } from "zod";

export const QuestionTypeEnum = z.enum([
  "single_choice",
  "multiple_choice",
  "text",
  "number",
  "yes_no",
  "info",
]);
export type QuestionType = z.infer<typeof QuestionTypeEnum>;

export const ResponseStatusEnum = z.enum(["IN_PROGRESS", "COMPLETED"]);
export type ResponseStatus = z.infer<typeof ResponseStatusEnum>;

export const VisibilityOperatorEnum = z.enum([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "gt",
  "lt",
  "gte",
  "lte",
]);
export type VisibilityOperator = z.infer<typeof VisibilityOperatorEnum>;

export const VisibilityConditionSchema = z.object({
  dependsOnQuestionCode: z.string().min(1, "相依題目代碼不可為空"),
  operator: VisibilityOperatorEnum,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});
export type VisibilityCondition = z.infer<typeof VisibilityConditionSchema>;

export const VisibilityRuleSchema = z.object({
  action: z.enum(["SHOW", "HIDE"]).default("SHOW"),
  logic: z.enum(["AND", "OR"]).default("AND"),
  conditions: z.array(VisibilityConditionSchema).min(1, "至少需設定一組條件"),
});
export type VisibilityRule = z.infer<typeof VisibilityRuleSchema>;

export const ChoiceSchema = z.object({
  id: z.string().optional(),
  orderNum: z.number().int().default(1),
  label: z.string().min(1, "選項標題不可為空"),
  value: z.string().min(1, "選項值不可為空"),
  scoreEnabled: z.boolean().default(false),
  score: z.number().nullable().default(null),
  isOther: z.boolean().default(false),
  requiresText: z.boolean().default(false),
  isNoneOfAbove: z.boolean().default(false),
});
export type ChoiceInput = z.infer<typeof ChoiceSchema>;

export const QuestionSchema = z.object({
  id: z.string().optional(),
  rowNum: z.number().int().optional(),
  orderNum: z.number().int().default(1),
  code: z.string().min(1, "題目代碼不可為空"),
  title: z.string().min(1, "題目內容不可為空"),
  description: z.string().nullable().optional(),
  questionType: QuestionTypeEnum,
  required: z.boolean().default(false),
  scoringEnabled: z.boolean().default(false),
  reverseScore: z.boolean().default(false),
  visibilityRules: z.union([z.string(), VisibilityRuleSchema, z.null()]).optional(),
  visibilityHint: z.string().nullable().optional(),
  minSelections: z.number().int().nullable().optional(),
  maxSelections: z.number().int().nullable().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  choices: z.array(ChoiceSchema).default([]),
});
export type QuestionInput = z.infer<typeof QuestionSchema>;

export const SurveySchema = z.object({
  id: z.string().optional(),
  parentSurveyId: z.string().nullable().optional(),
  version: z.number().int().default(1),
  title: z.string().min(1, "問卷標題不可為空"),
  description: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).default("DRAFT"),
  questions: z.array(QuestionSchema).default([]),
});
export type SurveyInput = z.infer<typeof SurveySchema>;

export const AnswerSubmissionSchema = z.object({
  questionCode: z.string(),
  rawValue: z.union([z.string(), z.array(z.string()), z.number(), z.null()]),
  otherText: z.string().nullable().optional(),
});
export type AnswerSubmission = z.infer<typeof AnswerSubmissionSchema>;

export const SurveySubmissionSchema = z.object({
  responseId: z.string().optional(),
  answers: z.array(AnswerSubmissionSchema),
});
export type SurveySubmission = z.infer<typeof SurveySubmissionSchema>;

export interface QuestionScoreResult {
  questionCode: string;
  questionTitle: string;
  questionType: QuestionType;
  isVisible: boolean;
  scoringEnabled: boolean;
  score: number | null;
  maxPossibleScore: number | null;
  isValid: boolean;
  error?: string;
}

export interface SurveyScoreResult {
  isValid: boolean;
  errors: { questionCode: string; message: string }[];
  questionResults: QuestionScoreResult[];
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
}
