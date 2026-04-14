const intRegex = /^-?\d+$/;
const noiseValue = /^-?\d+n+$/; // Noise - strings that match the custom format before being converted to it
const originalStringify = JSON.stringify;
const originalParse = JSON.parse;
const customFormat = /^-?\d+n$/;

/**
 * @typedef {(this: any, key: string | number | undefined, value: any) => any} Replacer
 * @typedef {(key: string | number | undefined, value: any, context?: { source: string }) => any} Reviver
 */

/**
 * Converts a JavaScript value to a JSON string.
 *
 * Supports serialization of BigInt values using two strategies:
 * 1. Custom format "123n" → "123" (universal fallback)
 * 2. Native JSON.rawJSON() (Node.js 22+, fastest) when available
 *
 * All other values are serialized exactly like native JSON.stringify().
 *
 * @param {*} value The value to convert to a JSON string.
 * @param {Replacer | Array<string | number> | null} [replacer]
 *   A function that alters the behavior of the stringification process,
 *   or an array of strings/numbers to indicate properties to exclude.
 * @param {string | number} [space]
 *   A string or number to specify indentation or pretty-printing.
 * @returns {string} The JSON string representation.
 */
const JSONStringify = (value, replacer, space) => {
  if ("rawJSON" in JSON) {
    return originalStringify(
      value,
      (key, value) => {
        if (typeof value === "bigint") return JSON.rawJSON(value.toString());

        if (typeof replacer === "function") return replacer(key, value);

        if (Array.isArray(replacer) && replacer.includes(key)) return value;

        return value;
      },
      space,
    );
  }

  if (!value) return originalStringify(value, replacer, space);

  const convertedToCustomJSON = originalStringify(
    value,
    (key, value) => {
      const isNoise = typeof value === "string" && noiseValue.test(value);

      if (isNoise) return value.toString() + "n"; // Mark noise values with additional "n" to offset the deletion of one "n" during the processing

      if (typeof value === "bigint") return value.toString() + "n";

      if (typeof replacer === "function") return replacer(key, value);

      if (Array.isArray(replacer) && replacer.includes(key)) return value;

      return value;
    },
    space,
  );
  return normalizeStringifiedJSON(convertedToCustomJSON);
};

const featureCache = new Map();

/**
 * Detects if the current JSON.parse implementation supports the context.source feature.
 *
 * Uses toString() fingerprinting to cache results and automatically detect runtime
 * replacements of JSON.parse (polyfills, mocks, etc.).
 *
 * @returns {boolean} true if context.source is supported, false otherwise.
 */
const isContextSourceSupported = () => {
  const parseFingerprint = JSON.parse.toString();

  if (featureCache.has(parseFingerprint)) {
    return featureCache.get(parseFingerprint);
  }

  try {
    const result = JSON.parse(
      "1",
      (_, __, context) => !!context?.source && context.source === "1",
    );
    featureCache.set(parseFingerprint, result);

    return result;
  } catch {
    featureCache.set(parseFingerprint, false);

    return false;
  }
};

/**
 * Reviver function that converts custom-format BigInt strings back to BigInt values.
 * Also handles "noise" strings that accidentally match the BigInt format.
 *
 * @param {string | number | undefined} key The object key.
 * @param {*} value The value being parsed.
 * @param {object} [context] Parse context (if supported by JSON.parse).
 * @param {Reviver} [userReviver] User's custom reviver function.
 * @returns {any} The transformed value.
 */
const convertMarkedBigIntsReviver = (key, value, context, userReviver) => {
  const isCustomFormatBigInt =
    typeof value === "string" && customFormat.test(value);
  if (isCustomFormatBigInt) return BigInt(value.slice(0, -1));

  const isNoiseValue = typeof value === "string" && noiseValue.test(value);
  if (isNoiseValue) return value.slice(0, -1);

  if (typeof userReviver !== "function") return value;

  return userReviver(key, value, context);
};

/**
 * Fast JSON.parse implementation (~2x faster than classic fallback).
 * Uses JSON.parse's context.source feature to detect integers and convert
 * large numbers directly to BigInt without string manipulation.
 *
 * Does not support legacy custom format from v1 of this library.
 *
 * @param {string} text JSON string to parse.
 * @param {Reviver} [reviver] Transform function to apply to each value.
 * @returns {any} Parsed JavaScript value.
 */
const JSONParseV2 = (text, reviver) => {
  return JSON.parse(text, (key, value, context) => {
    const isBigNumber =
      typeof value === "number" &&
      (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER);
    const isInt = context && intRegex.test(context.source);
    const isBigInt = isBigNumber && isInt;

    if (isBigInt) return BigInt(context.source);

    if (typeof reviver !== "function") return value;

    return reviver(key, value, context);
  });
};

const MAX_INT = Number.MAX_SAFE_INTEGER.toString();
const MAX_DIGITS = MAX_INT.length;
const noiseValueWithQuotes = /^"-?\d+n+"$/; // Noise - strings that match the custom format before being converted to it
const isDigit = (char) => char >= "0" && char <= "9";
const isWhitespace = (char) =>
  char === " " || char === "\n" || char === "\r" || char === "\t";

const findPreviousNonWhitespace = (text, index) => {
  for (let i = index; i >= 0; i--) {
    if (!isWhitespace(text[i])) return text[i];
  }

  return null;
};

const findNextNonWhitespace = (text, index) => {
  for (let i = index; i < text.length; i++) {
    if (!isWhitespace(text[i])) return text[i];
  }

  return null;
};

const normalizeStringifiedJSON = (text) => {
  let normalizedJSON = "";

  for (let i = 0; i < text.length;) {
    if (text[i] !== '"') {
      normalizedJSON += text[i];
      i++;
      continue;
    }

    const start = i;
    i++;

    while (i < text.length) {
      if (text[i] === "\\") {
        i += 2;
        continue;
      }

      if (text[i] === '"') {
        i++;
        break;
      }

      i++;
    }

    const stringToken = text.slice(start, i);
    const tokenValue = stringToken.slice(1, -1);
    const previousChar = findPreviousNonWhitespace(text, start - 1);
    const nextChar = findNextNonWhitespace(text, i);
    const isObjectKey = nextChar === ":";
    const canBeValue =
      previousChar === null || previousChar === ":" || previousChar === "[" || previousChar === ",";
    const endsValue =
      nextChar === null || nextChar === "," || nextChar === "]" || nextChar === "}";

    if (!isObjectKey && canBeValue && endsValue) {
      if (customFormat.test(tokenValue)) {
        normalizedJSON += tokenValue.slice(0, -1);
        continue;
      }

      if (noiseValue.test(tokenValue)) {
        normalizedJSON += '"' + tokenValue.slice(0, -1) + '"';
        continue;
      }
    }

    normalizedJSON += stringToken;
  }

  return normalizedJSON;
};

const markLargeNumbers = (text) => {
  let serializedData = "";

  for (let i = 0; i < text.length;) {
    const char = text[i];

    if (char === '"') {
      const start = i;
      i++;

      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }

        if (text[i] === '"') {
          i++;
          break;
        }

        i++;
      }

      const stringToken = text.slice(start, i);
      serializedData += noiseValueWithQuotes.test(stringToken)
        ? stringToken.slice(0, -1) + 'n"'
        : stringToken;
      continue;
    }

    if (char !== "-" && !isDigit(char)) {
      serializedData += char;
      i++;
      continue;
    }

    const tokenStart = i;
    let cursor = i;

    if (text[cursor] === "-") {
      cursor++;
    }

    const digitsStart = cursor;
    if (text[cursor] === "0") {
      cursor++;
    } else if (isDigit(text[cursor])) {
      cursor++;
      while (isDigit(text[cursor])) {
        cursor++;
      }
    } else {
      serializedData += char;
      i++;
      continue;
    }

    const digits = text.slice(digitsStart, cursor);
    let isFractionalOrExponential = false;

    if (text[cursor] === ".") {
      isFractionalOrExponential = true;
      cursor++;

      while (isDigit(text[cursor])) {
        cursor++;
      }
    }

    if (text[cursor] === "e" || text[cursor] === "E") {
      isFractionalOrExponential = true;
      cursor++;

      if (text[cursor] === "+" || text[cursor] === "-") {
        cursor++;
      }

      while (isDigit(text[cursor])) {
        cursor++;
      }
    }

    const token = text.slice(tokenStart, cursor);
    const isLessThanMaxSafeInt =
      digits.length < MAX_DIGITS ||
      (digits.length === MAX_DIGITS && digits <= MAX_INT);

    serializedData += isFractionalOrExponential || isLessThanMaxSafeInt
      ? token
      : '"' + token + 'n"';
    i = cursor;
  }

  return serializedData;
};

/**
 * Converts a JSON string into a JavaScript value.
 *
 * Supports parsing of large integers using two strategies:
 * 1. Classic fallback: Marks large numbers with "123n" format, then converts to BigInt
 * 2. Fast path (JSONParseV2): Uses context.source feature (~2x faster) when available
 *
 * All other JSON values are parsed exactly like native JSON.parse().
 *
 * @param {string} text A valid JSON string.
 * @param {Reviver} [reviver]
 *   A function that transforms the results. This function is called for each member
 *   of the object. If a member contains nested objects, the nested objects are
 *   transformed before the parent object is.
 * @returns {any} The parsed JavaScript value.
 * @throws {SyntaxError} If text is not valid JSON.
 */
const JSONParse = (text, reviver) => {
  if (!text) return originalParse(text, reviver);

  if (isContextSourceSupported()) return JSONParseV2(text, reviver); // Shortcut to a faster (2x) and simpler version

  // Find and mark big numbers with "n"
  const serializedData = markLargeNumbers(text);

  return originalParse(serializedData, (key, value, context) =>
    convertMarkedBigIntsReviver(key, value, context, reviver),
  );
};

export { JSONStringify, JSONParse };
