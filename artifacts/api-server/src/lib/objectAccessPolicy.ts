export interface ObjectMessageReference {
  type: string;
  content: string;
}

export function fileMessageReferencesPath(content: string, objectPath: string): boolean {
  try {
    const parsed = JSON.parse(content) as { path?: unknown };
    return parsed.path === objectPath;
  } catch {
    return false;
  }
}

export function hasReadableObjectReference(
  objectPath: string,
  profileReferenced: boolean,
  messageReferences: ObjectMessageReference[],
): boolean {
  if (profileReferenced) return true;
  return messageReferences.some(
    (message) =>
      (message.type === "image" && message.content === objectPath) ||
      (message.type === "file" && fileMessageReferencesPath(message.content, objectPath)),
  );
}
