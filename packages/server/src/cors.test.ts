import { describe, expect, it } from "vitest";
import { corsOriginHeader, parseAllowedOrigins } from "./cors";

describe("parseAllowedOrigins", () => {
  it("is empty when unset or blank", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins(" , ")).toEqual([]);
  });

  it("splits, trims and drops trailing slashes", () => {
    expect(
      parseAllowedOrigins(
        "https://cardgolf.party/, https://www.cardgolf.party",
      ),
    ).toEqual(["https://cardgolf.party", "https://www.cardgolf.party"]);
  });
});

describe("corsOriginHeader", () => {
  it("allows any page when there is no list", () => {
    expect(corsOriginHeader([], "http://localhost:5173")).toEqual({
      "Access-Control-Allow-Origin": "http://localhost:5173",
    });
    expect(corsOriginHeader([], null)).toEqual({
      "Access-Control-Allow-Origin": "*",
    });
  });

  it("echoes an allowed origin", () => {
    expect(
      corsOriginHeader(["https://cardgolf.party"], "https://cardgolf.party"),
    ).toEqual({
      "Access-Control-Allow-Origin": "https://cardgolf.party",
      Vary: "Origin",
    });
  });

  it("never echoes an origin that is not on the list", () => {
    const header = corsOriginHeader(
      ["https://cardgolf.party"],
      "https://evil.example",
    );
    expect(header["Access-Control-Allow-Origin"]).toBe(
      "https://cardgolf.party",
    );
    expect(
      corsOriginHeader(["https://cardgolf.party"], null)[
        "Access-Control-Allow-Origin"
      ],
    ).toBe("https://cardgolf.party");
  });
});
