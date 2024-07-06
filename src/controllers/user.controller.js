import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import { Subscription } from "../models/subscription.model.js";


const generateAccessAndRefereshTokens = async(userId) => {
    try {
        const user = await User.findById(userId);                //find user by id
        const accessToken = user.generateAccessToken()                //generate access token
        const refreshToken = user.generateRefreshToken()              //generate refresh token
        
        user.refreshToken = refreshToken                        //saving refresh token in db
        await user.save({validateBeforeSave: false})              //not validating before saving refresh token in mongodb

        return { accessToken, refreshToken }                 //returning access and refresh token to user

    } 
    catch (error) {
        throw new ApiError(500,"something went wrong while generating access and refresh token")
    }
}

const registerUser = asyncHandler(async(req,res) => {
    
    // Get user details from frontend
    const {fullName ,email, username, password } = req.body;
    
    // Validation: not empty
    if(
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required");
    }
    
    // Check if user already exists: username and email
    const existedUser = await User.findOne({
        $or: [{ email }, { username }]
    })
    if(existedUser) {
        throw new ApiError(409, "User with username or email already exists")
    }
    
    // Check for images, check for avatar
    const avatarLocalPath = req.files?.avatar[0]?.path;                 //it is optional finding " ?.?. "
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }
    
    // Upload avatar to Cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if(!avatar) {
        throw new ApiError(400, "Avatar file is required");
    }
    
    // Create user object and save to database
    const user = await User.create({
        fullName,
        avatar: avatar.url,                        //required filed so no need to check 
        coverImage : coverImage?.url || "",          //need to check if cover image is uploaded as it is not required field 
        email,
        password,
        username: username.toLowerCase(),
    })
    
    // Remove password and refreshToken fields from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"           //in this by default all entries are selected .so used '-' to remove any entry
    )
    if(!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }
    
    // Return response
    return res
    .status(201)
    .json(
        new ApiResponse(200, createdUser, "User Registered Successfully")
    )

})

const loginUser = asyncHandler(async (req, res) =>{
    // req body -> data
    // username or email
    //find the user
    //password check
    //access and referesh token
    //send cookie
    
    // Get user credentials from the request body
    const {email, username, password} = req.body
    console.log(email);
    
    // Ensure either username or email is provided
    if (!username && !email) {
        throw new ApiError(400, "username or email is required")
    }
    
    // Here is an alternative of above code based on logic discussed in video:
    // if (!(username || email)) {
    //     throw new ApiError(400, "username or email is required")
    // }
    
    // Find the user by username or email
    const user = await User.findOne({
        $or: [{username}, {email}]
    })
    if (!user) {
        throw new ApiError(404, "User does not exist")
    }
    
    // Check if the provided password is correct
    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials")
    }
    
    // Generate access and refresh tokens
    const {accessToken, refreshToken} = await generateAccessAndRefereshTokens(user._id)
    
    // Retrieve the logged-in user's details excluding password and refresh token
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    
    // Set cookie options
    const options = {
        httpOnly: true,
        secure: true
    }
    
    // Send response with cookies for access and refresh tokens
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200, 
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully"
        )
    )

})

const logoutUser = asyncHandler( async(req, res) => {
    // Find the user by ID and update the refreshToken to undefined
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1           //this removes field from document
            }
        },
        {
            new: true,
        }
    )
    
    // Set cookie options
    const options = {
        httpOnly : true,
        secure : true,               //only can modify with server
    }
    
    // Clear accessToken and refreshToken cookies and send a success response
    return res
   .status(200)
   .clearCookie("accessToken", options)
   .clearCookie("refreshToken", options)
   .json(
        new ApiResponse(200, {}, "User logged out")
    )

})

const refreshAccessToken = asyncHandler( async(req, res) => {
    // Retrieve the incoming refresh token from cookies or request body
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    
    // Ensure the refresh token is provided
    if(!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized Request")
    }

    try {
        // Verify the refresh token
        const decodedToken = jwt.verify( 
            incomingRefreshToken, 
            process.env.REFRESH_TOKEN_SECRET 
        )
        
        // Find the user by the ID from the decoded token
        const user = await User.findById(decodedToken?._id)
        if(!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
        
        // Check if the incoming refresh token matches the user's stored refresh token
        if(incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }
        
        // Set cookie options
        const options = {
            httpOnly: true,
            secure: true
        }
        
        // Generate new access and refresh tokens
        const { accessToken, newRefreshToken } = await generateAccessAndRefereshTokens(user._id)
        
        // Send response with new access and refresh tokens in cookies
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        // Handle any errors that occur during token verification or user lookup
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    // Extract current password and new password from the request body
    const { currentPassword, newPassword } = req.body;

    // Ensure both current password and new password are provided
    if (!currentPassword || !newPassword) {
        throw new ApiError(400, "Current password and new password are required");
    }

    // Find the user by their ID (assumed to be stored in req.user._id)
    const user = await User.findById(req.user?._id);
    // if (!user) {
    //     throw new ApiError(404, "User not found");
    // }

    // Verify the current password matches the user's stored password
    const isPasswordValid = await user.isPasswordCorrect(currentPassword);
    if (!isPasswordValid) {
        throw new ApiError(400, "Current password is incorrect");
    }

    // Update the user's password to the new password
    user.password = newPassword;

    // Save the updated user to the database
    await user.save({validateBeforeSave: false});

    // Send a success response
    return res
    .status(200)
    .json(
        new ApiResponse(200, {}, "Password changed successfully")
    );
});

const getCurrentUser = asyncHandler(async(req,res) => {
    return res
    .status(200)
    .json(
        new ApiResponse(200, req.user, "current user fetched successfully")
    )
})

const updateAccountDetails = asyncHandler(async(req,res) => {
    const {fullName, email} = req.body;

    // Ensure both full name and email are provided
    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required");
    }
    
    // Find the user by their ID and update the full name and email
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        {new: true}                 // Return the updated document
    ).select("-password")           // Exclude the password field from the returned document
    
    // Send a success response with the updated user details
    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Account details updated successfully")
    )
})

const updateUserAvatar = asyncHandler(async(req,res) => {
    // Get the avatar file path from the request
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar.url) {
        throw new ApiError(400, "Error while uploading avatar");
    }
    
    // Update the user's avatar URL in the database
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar updated successfully")
    )
})

const updateUserCoverImage = asyncHandler(async(req,res) => {
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath) {
        throw new ApiError(400, "Cover Image file is required");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!coverImage.url) {
        throw new ApiError(400, "Error while uploading cover image");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover image updated successfully")
    )
})

const getUserChannelProfile = asyncHandler(async(req,res) => {
    const { username } = req.params

    if(!username?.trim()) {
        throw new ApiError(400, "Username is missing");
    }

    const channel = await User.aggregate([
        {
            $match : {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",            // lowercase and plural
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",            // lowercase and plural
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {                         // adding more fields
                subscribersCount:{                // number of subscribers
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {      // number of channels subscribed to
                    $size: "$subscribedTo"
                },
                isSubscribed: {                   // tells if subsc to channel or not(button)
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else : false
                    }
                }
            }
        },
        {
            $project: {                           // project the specified fields
                fullName: 1,
                username: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                email: 1,
                isSubscribed: 1
            }
        }
    ])

    if(!channel?.length) {
        throw new ApiError(404, "Channel not found");
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async(req,res) => {
    //req.user._id                 //it gives us only string. mongoose convert it to mongodb id.
    const user = await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)            //manually convert it to mongodb id
            }
        },
        {
            $lookup: {
                from: "videos",            // lowercase and plural
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            user[0].watchHistory, 
            "Watch history fetched successfully"
        )
    )
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}