import mongoose from "mongoose";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Like } from "../models/like.model.js";
import { Video } from "../models/video.model.js";

const likeVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const existingLike = await Like.findOne({ video: videoId, user: userId });
    if (existingLike) {
        throw new ApiError(400, "You have already liked this video");
    }

    const like = new Like({ video: videoId, user: userId });
    await like.save();

    res.status(201).json(new ApiResponse(201, "Video liked successfully", like));
});

const unlikeVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const like = await Like.findOneAndDelete({ video: videoId, user: userId });
    if (!like) {
        throw new ApiError(404, "Like not found");
    }

    res.status(200).json(new ApiResponse(200, "Video unliked successfully"));
});

const getVideoLikes = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const likes = await Like.find({ video: videoId }).populate('user', 'name');
    res.status(200).json(new ApiResponse(200, "Likes fetched successfully", likes));
});

export { likeVideo, unlikeVideo, getVideoLikes };