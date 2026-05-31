export class ExecutionLogger {
  private readonly entries: string[] = [];

  log(message: string): void {
    const entry = `[${new Date().toISOString()}] ${message}`;
    this.entries.push(entry);
    console.log(entry);
  }

  all(): string[] {
    return [...this.entries];
  }
}
