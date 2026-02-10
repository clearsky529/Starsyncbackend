import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Project } from './project.entity';

@Entity('project_activity')
@Index(['projectId'])
@Index(['userId'])
@Index(['created_at'])
export class ProjectActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  actionType: string; // e.g., 'note_added', 'note_deleted', 'pattern_created', 'project_saved', etc.

  @Column({ type: 'text', nullable: true })
  description: string | null; // Human-readable description of the action

  @Column({ type: 'text', nullable: true })
  metadata: string | null; // JSON string with additional action details

  @CreateDateColumn()
  created_at: Date;
}

