import express from 'express';
import {
  listSnippets,
  toggleSnippetLike,
  addSnippetComment,
  deleteSnippet,
} from '../controllers/snippetController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/', listSnippets);
router.post('/:id/like', toggleSnippetLike);
router.post('/:id/comments', addSnippetComment);
router.delete('/:id', deleteSnippet);

export default router;
