import express from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  approveProject,
  rejectProject,
  toggleLike,
  toggleBookmark,
  rateProject,
  addComment,
  addContribution,
  editContribution,
  deleteContribution,
  submitDraft,
  joinCollaboration,
  toggleSpotlight,
  myProjects,
  myBookmarks,
  pendingProjects,
  groupProjects,
  listNews,
  toggleLock,
  toggleVisibility,
} from '../controllers/projectController.js';
import { protect, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// All project routes require auth (observers included)
router.use(protect);

router.get('/', listProjects);
router.get('/news', listNews);
router.get('/mine', myProjects);
router.get('/bookmarks', myBookmarks);
router.get('/pending', authorize('supervisor', 'admin'), pendingProjects);
router.get('/group/:groupId', groupProjects);

router.post('/', authorize('student', 'supervisor'), upload.single('document'), createProject);

router.get('/:id', getProject);
router.put('/:id', upload.single('document'), updateProject);
router.delete('/:id', deleteProject);

router.patch('/:id/approve', authorize('supervisor', 'admin'), approveProject);
// Only supervisors may reject — admins can approve/delete but never reject.
router.patch('/:id/reject', authorize('supervisor'), rejectProject);
router.patch('/:id/lock', authorize('supervisor', 'admin'), toggleLock);
router.patch('/:id/visibility', authorize('supervisor', 'admin'), toggleVisibility);
router.post('/:id/spotlight', authorize('supervisor'), toggleSpotlight);

router.post('/:id/like', toggleLike);
router.post('/:id/bookmark', toggleBookmark);
router.post('/:id/rate', authorize('supervisor'), rateProject);
router.post('/:id/comments', addComment);
router.post('/:id/contributions', addContribution);
router.patch('/:id/contributions/:contribId', editContribution);
router.delete('/:id/contributions/:contribId', deleteContribution);
router.post('/:id/submit', submitDraft);
router.post('/:id/collaborate', joinCollaboration);

export default router;
