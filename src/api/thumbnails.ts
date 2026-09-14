import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

const MAX_UPLOAD_SIZE = 10 << 20;

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = req.formData();
  const imageData = (await formData).get("thumbnail");

  if (!(imageData instanceof File)) throw new BadRequestError("It's not file");

  if (imageData.size > MAX_UPLOAD_SIZE)
    throw new BadRequestError("More than 10MB");

  const imageBytes = await imageData.arrayBuffer();

  const video = getVideo(cfg.db, videoId);

  if (!video) throw new NotFoundError("Not found");

  if (video.userID !== userID) throw new UserForbiddenError("Not allowed");

  const key: string = video.id;
  const thumbnail: Thumbnail = {
    data: imageBytes,
    mediaType: imageData.type,
  };

  videoThumbnails.set(key, thumbnail);

  const thumbnailURL = `http://localhost:${cfg.port}/api/thumbnails/${key}`;

  video.thumbnailURL = thumbnailURL;

  updateVideo(cfg.db, video);

  respondWithJSON(200, video);

  return respondWithJSON(200, null);
}
