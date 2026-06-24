import { describe, expect, it } from "vitest";
import { decodeProcessOutput } from "../../src/main/outputDecoder";

describe("decodeProcessOutput", () => {
  it("keeps utf-8 process output readable", () => {
    expect(decodeProcessOutput(Buffer.from("服务启动成功", "utf8"))).toBe("服务启动成功");
  });

  it("falls back to gbk when Windows process output is not valid utf-8", () => {
    expect(decodeProcessOutput(Buffer.from([0xb7, 0xfe, 0xce, 0xf1, 0xc6, 0xf4, 0xb6, 0xaf]))).toBe("服务启动");
  });
});
