import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,               //which origin you allow
    credentials: true,
}))

app.use(express.json({limit: "16kb"}))                            //limit you allow for json
app.use(express.urlencoded({extended: true ,limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser());

//routes import 
import userRouter from "./routes/user.routes.js";

//routes declarartion

app.use("/api/v1/users", userRouter)           // "app.use" is used instead of "app.get" bcz now router ,middleware,controller are in different files

/*   
  so ,in routes declaration it is prefix of url and it gives control to user.routes.js 
  and it has another route so it just adds like this :
  https://localhost:8000/api/v1/users/register
  and for another route in routes file there will be another new url.
*/

export {app}