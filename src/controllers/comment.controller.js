import mongoose from "mongoose";
import {ApiResponse} from "../utils/ApiResponse.js";
import {ApiError} from "../utils/ApiError.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {comment} from "../models/comment.model.js"

const getVideoComments = asyncHandler(async(req,res) => {
    
})