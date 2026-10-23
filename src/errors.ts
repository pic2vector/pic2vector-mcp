/** A problem the user can fix. The message is returned as tool text. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}
