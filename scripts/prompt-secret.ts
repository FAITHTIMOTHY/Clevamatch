export function promptSecret(label: string, optional = false): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive VS Code terminal so connection details can be entered securely.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const stdin = process.stdin;
    const previousRawMode = stdin.isRaw;
    const finish = (error?: Error) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(previousRawMode ?? false);
      stdin.pause();
      process.stdout.write("\r\n");
      if (error) reject(error);
      else if (!optional && !value.trim()) reject(new Error(`${label} is required.`));
      else resolve(value.trim());
    };

    const onData = (input: Buffer) => {
      for (const character of input.toString("utf8")) {
        if (character === "\u0003") {
          finish(new Error("Secure setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          process.stdout.write("*");
        }
      }
    };

    process.stdout.write(`${label}${optional ? " (leave blank if not needed)" : ""}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
