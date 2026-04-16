import { IsString, IsOptional, IsObject, ValidateIf } from 'class-validator';

export class JsonRpcRequest {
  @IsString()
  jsonrpc!: string;

  @IsString()
  method!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ValidateIf((o) => o.id !== undefined)
  id?: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function jsonRpcResult(
  id: string | number | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;
