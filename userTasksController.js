const { randomUUID } = require("crypto");

// In-memory store for demo/user-specific tasks.
// Shape: { [userId]: Array<{ id, title, completed, createdAt }> }
const userTasksStore = {};

function listUserTasks(userId) {
  if (!userTasksStore[userId]) {
    userTasksStore[userId] = [];
  }
  return userTasksStore[userId];
}

function createUserTask(userId, { title, completed = false }) {
  if (!userTasksStore[userId]) {
    userTasksStore[userId] = [];
  }

  const task = {
    id: randomUUID(),
    title,
    completed: Boolean(completed),
    createdAt: new Date().toISOString(),
  };

  userTasksStore[userId].push(task);
  return task;
}

module.exports = {
  listUserTasks,
  createUserTask,
};

