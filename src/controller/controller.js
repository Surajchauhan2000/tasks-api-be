const prisma = require("../prisma");

const getAllTasks = async (req, res) => {
    try {
        const tasks = await prisma.task.findMany({
            orderBy: { createdAt: "desc" },
        });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: "Tasks fetch nahi hue" });
    }
};

const getTaskById = async (req, res) => {
    try {
        const task = await prisma.task.findUnique({
            where: { id: Number(req.params.id) },
        });
        if (!task) return res.status(404).json({ error: "Task nahi mila" });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: "Task fetch nahi hua" });
    }
};

const createTask = async (req, res) => {
    try {
        const { title, description, dueDate } = req.body;
        if (!title) return res.status(400).json({ error: "Title zaroori hai" });

        const task = await prisma.task.create({
            data: {
                title,
                description,
                dueDate: dueDate ? new Date(dueDate) : null,
            },
        });
        res.status(201).json(task);
    } catch (err) {
        res.status(500).json({ error: "Task create nahi hua" });
    }
};

const updateTask = async (req, res) => {
    try {
        const { title, description, dueDate, completed } = req.body;
        const task = await prisma.task.update({
            where: { id: Number(req.params.id) },
            data: {
                title,
                description,
                dueDate: dueDate ? new Date(dueDate) : dueDate,
                completed,
            },
        });
        res.json(task);
    } catch (err) {
        res.status(404).json({ error: "Task update nahi hua (id check karo)" });
    }
};

const deleteTask = async (req, res) => {
    try {
        await prisma.task.delete({ where: { id: Number(req.params.id) } });
        res.json({ message: "Task delete ho gaya" });
    } catch (err) {
        res.status(404).json({ error: "Task delete nahi hua (id check karo)" });
    }
};

module.exports = {
    getAllTasks,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
};