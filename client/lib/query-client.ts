import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  // Production domain - hardcoded for EAS builds where env vars aren't available
  const PRODUCTION_DOMAIN = "swipeme.org";
  
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  // In EAS/production builds, EXPO_PUBLIC_DOMAIN is not set at runtime
  // Use the hardcoded production domain
  if (!host || host === "undefined" || host === "") {
    host = PRODUCTION_DOMAIN;
  }

  // Handle the case where env var might have port suffix from dev environment
  if (host.includes(":5000")) {
    host = host.replace(":5000", "");
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    
    const pathParts: string[] = [];
    const params: Record<string, string> = {};
    
    for (const part of queryKey) {
      if (typeof part === "string") {
        pathParts.push(part);
      } else if (typeof part === "object" && part !== null) {
        Object.entries(part as Record<string, unknown>).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params[key] = String(value);
          }
        });
      }
    }
    
    const url = new URL(pathParts.join("/"), baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
