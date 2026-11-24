declare module 'sveltekit-worker' {
  const worker: { fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> };
  export default worker;
}
