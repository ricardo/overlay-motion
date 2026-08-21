import { z } from "zod/v3";
import { templateSfx } from "../sound/config";

export type PropRow = {
  name: string;
  type: string;
  required: boolean;
  /** The schema's own `.describe()` text: what the prop is for, in prose. */
  description?: string;
  /** Formatted default, so the table answers "what happens if I omit this?". */
  default?: string;
  /** Every accepted value, for types whose list is too long to inline. */
  values?: string[];
};

export type TemplateJsonSchema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, TemplateJsonSchema>;
  required?: string[];
  items?: TemplateJsonSchema;
  anyOf?: TemplateJsonSchema[];
  additionalProperties?: boolean | TemplateJsonSchema;
};

const describe = (t: z.ZodTypeAny): string => {
  // The sound-cue union accepts 47 premade names plus any audio path, which is
  // a value LIST, not a type label. Name the three shapes instead and let the
  // row's `values` carry the full list.
  if (t === templateSfx) return "false | cue name | file path";
  const def = t._def;
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return describe(def.innerType);
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return describe(def.schema);
    case z.ZodFirstPartyTypeKind.ZodString:
      return "text";
    case z.ZodFirstPartyTypeKind.ZodNumber:
      return "number";
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return "true / false";
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return (def.values as string[]).join(" | ");
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return String(def.value);
    case z.ZodFirstPartyTypeKind.ZodArray: {
      const rawInner = def.type as z.ZodTypeAny;
      const inner = unwrapEffects(rawInner);
      if (inner._def.typeName === z.ZodFirstPartyTypeKind.ZodObject) {
        const keys = Object.keys((inner as z.ZodObject<z.ZodRawShape>).shape).join(", ");
        return `list of { ${keys} }`;
      }
      return `list of ${describe(inner)}`;
    }
    case z.ZodFirstPartyTypeKind.ZodObject:
      return "object";
    case z.ZodFirstPartyTypeKind.ZodUnion:
      return (def.options as z.ZodTypeAny[]).map(describe).join(" | ");
    default:
      return "value";
  }
};

const unwrapEffects = (type: z.ZodTypeAny): z.ZodTypeAny =>
  type._def.typeName === z.ZodFirstPartyTypeKind.ZodEffects
    ? unwrapEffects(type._def.schema)
    : type;

const objectSchema = (schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape> | null => {
  const unwrapped = unwrapEffects(schema);
  return unwrapped._def.typeName === z.ZodFirstPartyTypeKind.ZodObject
    ? (unwrapped as z.ZodObject<z.ZodRawShape>)
    : null;
};

/** Every literal/enum value a type accepts, flattened through unions. */
const listedValues = (t: z.ZodTypeAny): string[] | undefined => {
  const def = t._def;
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return listedValues(def.innerType);
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return listedValues(def.schema);
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return [...(def.values as string[])];
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return [String(def.value)];
    case z.ZodFirstPartyTypeKind.ZodUnion: {
      const values = (def.options as z.ZodTypeAny[]).flatMap((option) => listedValues(option) ?? []);
      return values.length ? values : undefined;
    }
    default:
      return undefined;
  }
};

/** `.describe()` text and default value, read through optional/default wrappers. */
const propMeta = (t: z.ZodTypeAny): { description?: string; defaultValue?: unknown } => {
  let type = t;
  let description = t.description;
  let defaultValue: unknown;
  while (
    type._def.typeName === z.ZodFirstPartyTypeKind.ZodOptional ||
    type._def.typeName === z.ZodFirstPartyTypeKind.ZodDefault ||
    type._def.typeName === z.ZodFirstPartyTypeKind.ZodEffects
  ) {
    if (type._def.typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
      defaultValue = type._def.defaultValue();
      type = type._def.innerType;
    } else if (type._def.typeName === z.ZodFirstPartyTypeKind.ZodOptional) {
      type = type._def.innerType;
    } else {
      type = type._def.schema;
    }
    description ??= type.description;
  }
  return { description, defaultValue };
};

/** Defaults are shown as the JSON a caller would type; objects stay out of the table. */
const formatDefault = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === "object" && value !== null) {
    const json = JSON.stringify(value);
    return json.length <= 40 ? json : undefined;
  }
  return JSON.stringify(value);
};

export const schemaRows = (schema: z.ZodTypeAny): PropRow[] =>
  Object.entries(objectSchema(schema)?.shape ?? {})
    .filter(([name]) => name !== "sourceSrc")
    .map(([name, raw]) => {
      const t = raw as z.ZodTypeAny;
      const { description, defaultValue } = propMeta(t);
      const values = listedValues(t);
      const formatted = formatDefault(defaultValue);
      return {
        name,
        type: describe(t),
        required: !t.isOptional(),
        ...(description ? { description } : {}),
        ...(formatted !== undefined ? { default: formatted } : {}),
        ...(values ? { values } : {}),
      };
    });

const jsonSchemaFor = (input: z.ZodTypeAny): TemplateJsonSchema => {
  let type = input;
  let description = input.description;
  let defaultValue: unknown;

  while (
    type._def.typeName === z.ZodFirstPartyTypeKind.ZodOptional ||
    type._def.typeName === z.ZodFirstPartyTypeKind.ZodDefault ||
    type._def.typeName === z.ZodFirstPartyTypeKind.ZodEffects
  ) {
    if (type._def.typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
      defaultValue = type._def.defaultValue();
      type = type._def.innerType;
    } else if (type._def.typeName === z.ZodFirstPartyTypeKind.ZodOptional) {
      type = type._def.innerType;
    } else {
      type = type._def.schema;
    }
    description ??= type.description;
  }

  const decorate = (schema: TemplateJsonSchema): TemplateJsonSchema => ({
    ...schema,
    ...(description ? { description } : {}),
    ...(defaultValue !== undefined ? { default: defaultValue } : {}),
  });

  switch (type._def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodString: {
      const checks = type._def.checks as Array<{
        kind: string;
        value?: number;
        regex?: RegExp;
      }>;
      return decorate({
        type: "string",
        ...(checks.find((check) => check.kind === "min")?.value !== undefined
          ? { minLength: checks.find((check) => check.kind === "min")!.value }
          : {}),
        ...(checks.find((check) => check.kind === "max")?.value !== undefined
          ? { maxLength: checks.find((check) => check.kind === "max")!.value }
          : {}),
        ...(checks.find((check) => check.kind === "regex")?.regex
          ? { pattern: checks.find((check) => check.kind === "regex")!.regex!.source }
          : {}),
      });
    }
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const checks = type._def.checks as Array<{ kind: string; value?: number }>;
      return decorate({
        type: checks.some((check) => check.kind === "int") ? "integer" : "number",
        ...(checks.find((check) => check.kind === "min")?.value !== undefined
          ? { minimum: checks.find((check) => check.kind === "min")!.value }
          : {}),
        ...(checks.find((check) => check.kind === "max")?.value !== undefined
          ? { maximum: checks.find((check) => check.kind === "max")!.value }
          : {}),
      });
    }
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return decorate({ type: "boolean" });
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return decorate({ type: "string", enum: [...type._def.values] });
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return decorate({ const: type._def.value });
    case z.ZodFirstPartyTypeKind.ZodArray:
      return decorate({
        type: "array",
        items: jsonSchemaFor(type._def.type),
        ...(type._def.minLength ? { minItems: type._def.minLength.value } : {}),
        ...(type._def.maxLength ? { maxItems: type._def.maxLength.value } : {}),
      });
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (type as z.ZodObject<z.ZodRawShape>).shape;
      const entries = Object.entries(shape).filter(([name]) => name !== "sourceSrc");
      return decorate({
        type: "object",
        properties: Object.fromEntries(
          entries.map(([name, child]) => [name, jsonSchemaFor(child as z.ZodTypeAny)]),
        ),
        required: entries
          .filter(([, child]) => !(child as z.ZodTypeAny).isOptional())
          .map(([name]) => name),
        additionalProperties: false,
      });
    }
    case z.ZodFirstPartyTypeKind.ZodUnion:
      return decorate({
        anyOf: type._def.options.map((option: z.ZodTypeAny) => jsonSchemaFor(option)),
      });
    case z.ZodFirstPartyTypeKind.ZodRecord:
      return decorate({
        type: "object",
        additionalProperties: jsonSchemaFor(type._def.valueType),
      });
    default:
      return decorate({});
  }
};

/** Nested, machine-readable props contract for editing agents. */
export const templatePropsJsonSchema = (schema: z.ZodTypeAny): TemplateJsonSchema =>
  jsonSchemaFor(schema);
