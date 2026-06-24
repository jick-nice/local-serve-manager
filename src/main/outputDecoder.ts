import { TextDecoder } from "node:util";

const gbkDecoder = new TextDecoder("gbk");

export const decodeProcessOutput = (chunk: Buffer | string): string => {
  if (typeof chunk === "string") return chunk;

  const utf8 = chunk.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  return gbkDecoder.decode(chunk);
};
