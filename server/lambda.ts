import { createRequestHandler } from "@react-router/architect";
// @ts-ignore (no types declared for build)
import * as build from "../build/server";

export const handler = createRequestHandler({
  build,
  mode: process.env.NODE_ENV,
});