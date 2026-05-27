import multer from "multer";
import { AppError } from "../errors/AppError.js";

export const assessmentSourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter(_request, file, callback) {
    if (file.mimetype === "application/pdf" || file.mimetype === "text/plain") {
      callback(null, true);
      return;
    }

    callback(
      new AppError(
        415,
        "UNSUPPORTED_SOURCE_TYPE",
        "Only PDF and plain text uploads are supported.",
      ),
    );
  },
});
