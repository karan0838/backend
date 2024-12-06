import mongoose from "mongoose";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Comment } from "../models/comment.model.js";

const getVideoComments = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const comments = await Comment.aggregate([
        { $match: { video: mongoose.Types.ObjectId(videoId) } },
        { $sort: { createdAt: -1 } },
        {
            $facet: {
                metadata: [{ $count: "total" }, { $addFields: { page: Number(page) } }],
                data: [{ $skip: (page - 1) * limit }, { $limit: Number(limit) }]
            }
        }
    ]);

    const response = comments[0];
    if (!response.metadata.length) {
        response.metadata = [{ total: 0, page: Number(page) }];
    }

    res.status(200).json(new ApiResponse(200, "Comments fetched successfully", response));
});

export { getVideoComments };