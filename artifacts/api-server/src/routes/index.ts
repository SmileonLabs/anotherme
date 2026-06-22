import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import friendsRouter from "./friends";
import roomsRouter from "./rooms";
import messagesRouter from "./messages";
import invitesRouter from "./invites";
import blockedRouter from "./blocked";
import callsRouter from "./calls";
import storageRouter from "./storage";
import dungeonsRouter from "./dungeons";
import battlesRouter from "./battles";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(friendsRouter);
router.use(roomsRouter);
router.use(messagesRouter);
router.use(invitesRouter);
router.use(blockedRouter);
router.use(callsRouter);
router.use(storageRouter);
router.use(dungeonsRouter);
router.use(battlesRouter);

export default router;
