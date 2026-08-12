

export const rawBodyMiddleware = (req: any, res: any, next: any) => {
  // TypeScript types adjust kar lo
  if (req.method !== "POST") return next();
  let data = Buffer.alloc(0);
  req.on("data", (chunk: Buffer) => (data = Buffer.concat([data, chunk])));
  req.on("end", () => {
    req.body = data;
    next();
  });
  req.on("error", () => res.status(400).send("Bad Request"));
};

