import { NextRequest, NextResponse } from "next/server";
import { saveLocalFile } from "@/lib/file-storage";

// This function handles POST requests to /api/upload
export async function POST(request: NextRequest) {
  try {
    //  Parse the incoming form data
    const formData = await request.formData();

    // Gets the file from the form data (must match the key used in frontend)
    const file = formData.get("file") as File | null;

    // Checks if the file is valid before uploading
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // These are the only file types that are allowed to be uploaded in Students
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.ms-excel", // xls
      "text/csv", // csv
    ];

    // Checks if the file type is allowed
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed" },
        { status: 400 },
      );
    }

    // Save the file using our helper
    // We'll save it to a 'documents' folder inside public/uploads (Can be changed)
    const filePath = await saveLocalFile(file, "documents");

    // Return success response with the path
    return NextResponse.json({
      success: true,
      filePath: filePath,
      message: "File uploaded successfully",
    });
  } catch (error) {
    console.error("Error handling upload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
