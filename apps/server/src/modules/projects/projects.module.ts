import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectPlanService } from './project-plan.service';
import { ProjectCommentsService } from './project-comments.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectPlanService, ProjectCommentsService],
  exports: [ProjectsService, ProjectPlanService],
})
export class ProjectsModule {}
