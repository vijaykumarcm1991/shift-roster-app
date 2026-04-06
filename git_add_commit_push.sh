#!/bin/bash
git status
git add .
git status
read -p "Enter commit message: " commit_message
git commit -m "$commit_message"
git push -u origin main
git status