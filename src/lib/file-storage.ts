import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * Saves a file to the local filesystem.
 *
 * @param file The File object from the form data
 * @param subFolder Optional subfolder within the public/uploads directory
 * @returns The public URL path to the saved file
 */
export async function saveLocalFile(
  file: File,
  subFolder: string = "general",
): Promise<string> {
  // 1. Convert the File content (which is a Blob) into a Node.js Buffer
  // Browser 'File' objects are not directly writable by Node.js, so we convert to a Buffer.
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // 2. define where we want to save it (e.g., /public/uploads/general)
  // We save to 'public' so the browser can access it later via URL (e.g. <img src="/uploads/..." />)
  const uploadDir = join(process.cwd(), "public", "uploads", subFolder);

  // 3. Create the directory if it doesn't exist
  // 'recursive: true' ensures it creates parent folders too (like mkdir -p)
  try {
    await mkdir(uploadDir, { recursive: true });
  } catch (error) {
    // If it fails because it already exists, that's fine.
    // If it fails for another reason, the next step will catch it.
    console.log("Directory might already exist or error creating it", error);
  }

  // 4. Create a unique filename to prevent overwriting
  // We use Date.now() to ensure uniqueness if the same file is uploaded twice.
  // We also replace spaces with underscores to avoid URL issues.
  const uniqueName = `${Date.now()}-${file.name.replace(/\s/g, "_")}`;
  const finalPath = join(uploadDir, uniqueName);

  // 5. Write the file to disk
  // This physically saves the file to your computer's hard drive at 'finalPath'
  await writeFile(finalPath, buffer);

  // Return the path that the frontend can use to display/download the file
  return `/uploads/${subFolder}/${uniqueName}`;
}
