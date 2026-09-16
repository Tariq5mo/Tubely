import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import { file, type BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "node:path";
import { randomBytes } from "node:crypto";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const MAX_UPLOAD_SIZE = 10 << 20;

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = req.formData();
  const imageFile = (await formData).get("thumbnail");

  if (!(imageFile instanceof File)) throw new BadRequestError("It's not file");

  if (imageFile.size > MAX_UPLOAD_SIZE)
    throw new BadRequestError("More than 10MB");

  const imageType = imageFile.type;

  if (imageType !== "image/jpeg" && imageType !== "image/png")
    throw new BadRequestError("The file must be image/jpeg or image/png");

  const extension = imageType.split("/")[1];
  const imageBytes = await imageFile.arrayBuffer();

  const nameFile = randomBytes(32).toString("base64");

  const video = getVideo(cfg.db, videoId);

  if (!video) throw new NotFoundError("Not found");

  if (video.userID !== userID) throw new UserForbiddenError("Not allowed");

  const key: string = video.id;

  const filePath = path.join(cfg.assetsRoot, `${nameFile}.${extension}`);

  const f = await Bun.write(filePath, imageBytes);
  if (!f) throw new Error("Can't create the file");

  const thumbnailURL = `http://localhost:${cfg.port}/assets/${nameFile}.${extension}`;

  video.thumbnailURL = thumbnailURL;

  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
