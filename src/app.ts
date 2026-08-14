import express from "express";
import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import { isRedisAvailable } from "./config/redis.js";
import authRoutes from "./routes/auth-routes.js";
import adminRoutes from "./routes/admin-routes.js";
import { adminAuthGuard, userAuthGuard } from "./middleware/auth.js";
import userRoutes from "./routes/user-routes.js";
import bodyParser from "body-parser";
import { afterSubscriptionCreatedService, handleInAppAndroidWebhook, handleInAppIOSController, handleInAppIOSWebhook } from "./controllers/purchase-controller.js";
import { rawBodyMiddleware } from "./middleware/plan.js";
import { decodeSignedPayload } from "./helpers/plans-helpers.js";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "./utils/responses.js";
import { notificationAnnouncementCron, notificationGarbageCollectionCron, startReminderAndUpdateCronJob, updateExpiredSubscriptions } from "./cron-job/update-purchase-cron.js";
import { initializeFirebase } from "./config/fcm.js";
 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8001;
const app = express();

initializeFirebase()

// Accept JSON primitives like "null"/"true" that some clients send
app.post("/webhook", express.raw({ type: "application/json" }), afterSubscriptionCreatedService);
app.get("/webhook", async (req: any, res: any) => {
	return res.status(200).send("Webhook url");
});


app.post("/api/in-app-ios",userAuthGuard, rawBodyMiddleware, handleInAppIOSController);

app.post("/in-app-ios-production", rawBodyMiddleware, async (req: any, res: any) => {
	try {
		const bodyBuffer = req.body as Buffer;
		if (bodyBuffer.length === 0) return res.status(400).send("Empty body");
		const bodyStr = bodyBuffer.toString("utf8");
		let parsedBody: any;
		try {
			parsedBody = JSON.parse(bodyStr);
		} catch (e) {
			return res.status(400).send("Invalid JSON");
		}
		const { signedPayload } = parsedBody;
		if (!signedPayload) {
			console.log("⚠️ No signedPayload in request");
			return res.sendStatus(200);
		}
		const decodedOuter = await decodeSignedPayload(signedPayload);
		// await handleInAppIOSWebhookProduction(
		//   decodedOuter,
		//   req,
		//   res
		// );

		return OK(res, {}, "OK");
	} catch (err: any) {
		if (err.message) {
			return BADREQUEST(res, err.message);
		}
		return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
	}
});

app.set("trust proxy", true);
app.use((req, _res, next) => {
	console.log(`[API] ${req.method} ${req.originalUrl}`);
	next();
});
app.use(express.json({ strict: false }));
// app.use(bodyParser.json({
//     verify: (req: any, res, buf) => {
//         req.rawBody = buf.toString();
//     }
// }))
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
	cors({
		origin: "*",
		methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
		// credentials: true,
	}),
);

var dir = path.join(__dirname, "static");
app.use(express.static(dir));

connectDB();
isRedisAvailable();
startReminderAndUpdateCronJob();
notificationAnnouncementCron();
notificationGarbageCollectionCron();
updateExpiredSubscriptions();
app.get("/", (_, res: any) => {
	res.send("Hello world entry point 🚀✅");
});
app.use(
	"/.well-known",
	express.static(".well-known", {
		setHeaders: (res, path) => {
			if (path.endsWith("apple-app-site-association")) {
				res.setHeader("Content-Type", "application/json");
			}
		},
	}),
);
app.use("/api", authRoutes);
app.use("/api/admin", adminAuthGuard, adminRoutes);
app.use("/api/user", userAuthGuard, userRoutes);

// JSON syntax error handler for invalid request bodies
app.use((err: any, req: any, res: any, next: any) => {
	if (err instanceof SyntaxError && (err as any)?.status === 400 && "body" in err) {
		console.error("****ERROR-INVALID-JSON**** :->", {
			method: req.method,
			path: req.originalUrl,
			route: req.route?.path ?? req.originalUrl,
			error: err,
		});
		return res.status(400).json({
			success: false,
			error: "Invalid JSON payload. Please send valid JSON with double-quoted property names.",
			path: process.env.ENV === "DEV" ? req.originalUrl : undefined,
		});
	}
	next(err);
});

app.use((err: any, req: any, res: any, next: any) => {
	if (res.headersSent) {
		return next(err);
	}

	console.error("****ERROR-UNHANDLED**** :->", {
		method: req.method,
		path: req.originalUrl,
		route: req.route?.path ?? req.originalUrl,
		error: err,
	});

	return res.status(err?.statusCode || err?.status || 500).json({
		success: false,
		message: err?.message || "Internal Server Error",
		error: process.env.ENV === "DEV" ? err?.message || String(err) : undefined,
		stack: process.env.ENV === "DEV" && err?.stack ? err.stack : undefined,
		path: process.env.ENV === "DEV" ? req.originalUrl : undefined,
		data: null,
	});
});


app.listen(PORT, () => console.log(`Server is listening on port http://localhost:${PORT}`));
