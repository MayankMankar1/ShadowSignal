// backend/src/utils/generateRoomCode.ts

const ROOM_CODE_LENGTH = 5;
const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generates a random uppercase room code (e.g. "QKJTZ")
 */
export function generateRoomCode(): string {
  let code = "";

  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * CHARACTERS.length);
    code += CHARACTERS[randomIndex];
  }

  return code;
}
