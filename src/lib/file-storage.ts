import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function saveLocalFile(
  file: File,
  subFolder: string = "general",
): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = join(process.cwd(), "public", "uploads", subFolder);

  try {
    await mkdir(uploadDir, { recursive: true });
  } catch (error) {
    console.log("Directory might already exist or error creating it", error);
  }

  const uniqueName = `${Date.now()}-${file.name.replace(/\s/g, "_")}`;
  const finalPath = join(uploadDir, uniqueName);

  await writeFile(finalPath, buffer);
  return `/uploads/${subFolder}/${uniqueName}`;
}
