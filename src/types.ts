export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
};

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true?: string; false?: string };
};

export type ScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: string[];
};

export type DecisionQuestion = ChoiceQuestion | NoulQuestion | ScoreQuestion;
export type DecisionQuestions = Record<string, DecisionQuestion>;

export interface DecisionRequest {
  state: JsonValue;
  questions: DecisionQuestions;
  provider?: string;
  model?: string;
}

export interface DecisionResponse {
  provider: string;
  model?: string;
  answers: Record<string, JsonValue>;
  usage?: JsonValue;
  raw?: JsonValue;
}

export interface DecisionProvider {
  readonly id: string;
  readonly description: string;
  decide(request: DecisionRequest): Promise<DecisionResponse>;
  available(): Promise<{ ok: boolean; detail?: string }>;
}
