import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { getBearerToken, validateJWT } from "../auth";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getVideo, updateVideo } from "../db/videos";
import path from "node:path";

const MAX_UPLOAD_SIZE = 1 << 30;

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading video", "by user", userID);

  const formData = req.formData();
  const videoFile = (await formData).get("video");

  if (!(videoFile instanceof File)) throw new BadRequestError("It's not file");

  if (videoFile.size > MAX_UPLOAD_SIZE)
    throw new BadRequestError("More than 1GB");

  const video = getVideo(cfg.db, videoId);
  const videoBytes = await videoFile.arrayBuffer(); //?

  if (!video) throw new NotFoundError("Not found");

  if (video.userID !== userID) throw new UserForbiddenError("Not allowed");

  const videoType = videoFile.type;
  const extension = videoType.split("/")[1];
  const key = `${videoId}.${extension}`;

  if (videoType !== "video/mp4")
    throw new BadRequestError("The file must be video/mp4");

  const filePath = path.join(cfg.assetsRoot, key);

  const f = await Bun.write(filePath, videoBytes); //?
  if (!f) throw new Error("Can't create the temp file");

  const remoteFile = cfg.s3Client.file(key);

try {
    await remoteFile.write(
      Bun.file(filePath, {
        type: videoType,
      }),
    );

    video.videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${key}`;

    updateVideo(cfg.db, video);
    return respondWithJSON(200, null);
} finally {
  await Bun.file(filePath).delete();
}
}
