import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { User } from './user.entity';

@Entity('chat_read_receipts')
@Unique(['message_id', 'user_id']) // Each user can only have one read receipt per message
@Index(['user_id'])
@Index(['message_id'])
@Index(['read_at'])
export class ChatReadReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  message_id: string;

  @ManyToOne(() => ChatMessage, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'message_id' })
  message: ChatMessage;

  @Column({ type: 'varchar', length: 36 })
  user_id: string;

  @ManyToOne(() => User, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  read_at: Date;
}

